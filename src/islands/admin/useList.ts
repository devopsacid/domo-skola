import { useCallback, useReducer, useRef, useState } from 'preact/hooks';
import type { AdminApi, ApiFailure } from './api';
import {
  EMPTY_LIST,
  INITIAL_FILTERS,
  listReducer,
  searchText,
  toQuery,
  type Filters,
} from './state';

/**
 * The record list lives above the views, so filters, the loaded rows and the "load more" depth survive
 * a visit to a record. Search text is part of `filters` and therefore only in memory.
 */
export function useRecordList(api: AdminApi, onFailure: (f: ApiFailure) => void) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [list, dispatch] = useReducer(listReducer, EMPTY_LIST);
  const seq = useRef(0);
  const stale = useRef(true);
  const cursor = useRef<string | null>(null);
  cursor.current = list.nextCursor;

  const load = useCallback(
    async (f: Filters, append: boolean) => {
      const mine = ++seq.current;
      stale.current = false;
      dispatch({ kind: 'start', append, seq: mine });
      const query = toQuery(f, append ? cursor.current : null);
      const text = searchText(f);
      const res = text ? await api.search(query, text) : await api.list(query);
      if (res.ok) {
        dispatch({
          kind: 'loaded',
          seq: mine,
          items: res.data.items,
          nextCursor: res.data.next_cursor,
          append,
        });
      } else {
        dispatch({ kind: 'failed', seq: mine, error: res });
        if (res.kind === 'unauthorized') onFailure(res);
      }
    },
    [api, onFailure],
  );

  const apply = useCallback(
    (next: Filters) => {
      setFilters(next);
      void load(next, false);
    },
    [load],
  );

  return {
    filters,
    list,
    apply,
    load,
    /** Mark the rows out of date (after a delete or status change); the list view reloads on mount. */
    markStale: () => {
      stale.current = true;
    },
    isStale: () => stale.current,
  };
}
