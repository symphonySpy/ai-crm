'use client';

import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from '@/constants';

/**
 * The filter state behind a list screen: search box, filters, and page.
 *
 * Named after tmk-admin's hooks/useTableParams, and doing the same job — it just holds
 * what a table is currently showing. The two details worth keeping out of the page:
 *
 *   `search` (what is typed) is separate from `query` (what has been sent), which is
 *   what makes debouncing possible at all; and every filter change resets to page 1,
 *   because landing on page 7 of a three-page result is a bug the user has to undo.
 */
export interface TableParams {
  search: string;
  query: string;
  stage: string;
  triageOnly: boolean;
  page: number;
  setSearch: (value: string) => void;
  setStage: (value: string) => void;
  setTriageOnly: (value: boolean) => void;
  setPage: (updater: number | ((current: number) => number)) => void;
}

export function useTableParams(): TableParams {
  const [search, setSearchValue] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStageValue] = useState('');
  const [triageOnly, setTriageOnlyValue] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  return {
    search,
    query,
    stage,
    triageOnly,
    page,
    setSearch: setSearchValue,
    setStage: (value) => {
      setStageValue(value);
      setPage(1);
    },
    setTriageOnly: (value) => {
      setTriageOnlyValue(value);
      setPage(1);
    },
    setPage,
  };
}
