const key = (boardId: string, suffix: string) => `ar:${boardId}:${suffix}`

export const storage = {
  getToken: (boardId: string) => localStorage.getItem(key(boardId, 'token')),
  setToken: (boardId: string, token: string) => localStorage.setItem(key(boardId, 'token'), token),
  getAdminToken: (boardId: string) => localStorage.getItem(key(boardId, 'admin')),
  setAdminToken: (boardId: string, token: string) => localStorage.setItem(key(boardId, 'admin'), token),
  getIdentity: (boardId: string) => {
    const raw = localStorage.getItem(key(boardId, 'identity'))
    return raw ? (JSON.parse(raw) as { color: string; animal: string }) : null
  },
  setIdentity: (boardId: string, identity: { color: string; animal: string }) =>
    localStorage.setItem(key(boardId, 'identity'), JSON.stringify(identity)),
  removeToken: (boardId: string) => localStorage.removeItem(key(boardId, 'token')),
  getOnboardingSeen: (boardId: string) => localStorage.getItem(key(boardId, 'onboarded')) === '1',
  setOnboardingSeen: (boardId: string) => localStorage.setItem(key(boardId, 'onboarded'), '1'),
  getLastSeen: (boardId: string, col: string) =>
    Number(localStorage.getItem(key(boardId, `seen:${col}`)) ?? 0),
  setLastSeen: (boardId: string, col: string, ts: number) =>
    localStorage.setItem(key(boardId, `seen:${col}`), String(ts)),
}
