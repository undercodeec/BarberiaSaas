export function focusedInterval(
  isFocused: boolean,
  milliseconds: number,
): number | false {
  return isFocused ? milliseconds : false;
}
