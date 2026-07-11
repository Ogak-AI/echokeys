export const context = {
  username: 'Player',
};

export function navigateTo(target: string) {
  if (typeof window !== 'undefined') {
    window.location.href = target;
  }
  return Promise.resolve();
}

export function requestExpandedMode(_event: Event | MouseEvent | unknown, _screen: string) {
  return Promise.resolve();
}
