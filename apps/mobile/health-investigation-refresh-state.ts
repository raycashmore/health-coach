type RefreshState = {
  isRefreshing: boolean;
  refreshError: string | null;
};

export function beginRefresh<State extends RefreshState>(state: State): State {
  return { ...state, isRefreshing: true, refreshError: null };
}

export function failRefresh<State extends RefreshState>(state: State, message: string): State {
  return { ...state, isRefreshing: false, refreshError: message };
}
