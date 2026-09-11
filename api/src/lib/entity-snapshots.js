'use strict';

// Builders for the *_data_json / *_master_json columns, plus the hooks that fill them.
//
// Each builder takes an instance and returns the fields worth freezing: identity and
// the labels a person reads. Personal contact details (phone, email on a contact, LINE
// user id) are deliberately left out — they stay on the live row, and copying them into
// every related record multiplies what must be erased on a deletion request.

const companyJson = (c) =>
  c && { id: c.id, name: c.name, industry: c.industry, is_active: c.is_active };

const contactJson = (c) =>
  c && { id: c.id, name: c.name, company_id: c.company_id, is_active: c.is_active };

const userJson = (u) =>
  u && { id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active };

const leadJson = (l) =>
  l && {
    id: l.id,
    title: l.title,
    stage: l.stage,
    value_thb: l.value_thb,
    source: l.source,
    owner_id: l.owner_id,
  };

/**
 * Wire the snapshot hooks.
 *
 * On rows that are edited (contacts, leads) the snapshot refreshes whenever the foreign
 * key itself changes — moving a contact to another company recaptures that company.
 * A rename of the company does NOT refresh it, and that is the point: the record was
 * attached to the company under the name it had then. The rename is recorded separately
 * in tbl_audit_history, so both questions have an answer.
 *
 * On append-only rows (activities, messages, ai_suggestions) the snapshot is taken once
 * at creation, because those rows describe a moment that never changes.
 */
function attachEntitySnapshots(db) {
  const load = (Model, id, options) =>
    (id ? Model.findByPk(id, { transaction: options.transaction }) : Promise.resolve(null));

  // --- contacts: the company they belong to ---------------------------------
  const contactSnapshot = async (contact, options) => {
    if (!contact.changed('company_id')) return;
    const company = await load(db.Company, contact.get('company_id'), options);
    contact.set('company_master_json', companyJson(company));
  };
  db.Contact.addHook('beforeCreate', contactSnapshot);
  db.Contact.addHook('beforeUpdate', contactSnapshot);

  // --- leads: contact, company and owner ------------------------------------
  const leadSnapshot = async (lead, options) => {
    if (lead.changed('contact_id')) {
      lead.set('contact_data_json', contactJson(await load(db.Contact, lead.get('contact_id'), options)));
    }
    if (lead.changed('company_id')) {
      lead.set('company_data_json', companyJson(await load(db.Company, lead.get('company_id'), options)));
    }
    if (lead.changed('owner_id')) {
      lead.set('owner_data_json', userJson(await load(db.User, lead.get('owner_id'), options)));
    }
  };
  db.Lead.addHook('beforeCreate', leadSnapshot);
  db.Lead.addHook('beforeUpdate', leadSnapshot);

  // --- append-only rows: captured once, at creation --------------------------
  db.Activity.addHook('beforeCreate', async (activity, options) => {
    activity.set('lead_data_json', leadJson(await load(db.Lead, activity.get('lead_id'), options)));
    activity.set('actor_data_json', userJson(await load(db.User, activity.get('actor_id'), options)));
  });

  db.Message.addHook('beforeCreate', async (message, options) => {
    message.set('lead_data_json', leadJson(await load(db.Lead, message.get('lead_id'), options)));
    message.set('contact_data_json', contactJson(await load(db.Contact, message.get('contact_id'), options)));
  });

  db.AiSuggestion.addHook('beforeCreate', async (suggestion, options) => {
    suggestion.set('lead_data_json', leadJson(await load(db.Lead, suggestion.get('lead_id'), options)));
  });
}

module.exports = { attachEntitySnapshots, companyJson, contactJson, userJson, leadJson };
