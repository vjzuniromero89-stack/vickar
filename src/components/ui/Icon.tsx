type IconName = "search" | "close" | "user" | "arrow" | "plus" | "minus" | "lock" | "box" | "tag" | "grid" | "receipt" | "logout" | "edit" | "trash" | "upload" | "external" | "book"

const paths: Record<IconName, string> = {
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.6-1.9L20 20",
  close: "M5 5l14 14M19 5L5 19",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5",
  arrow: "M4 12h15m-5-5 5 5-5 5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0L12 12m0 0 9-4.5M12 12v9",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm5-5h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 20h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  book: "M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2V5Zm0 15a2 2 0 0 0 2 2h12v-4M9 7h6M9 11h6",
}

/** Hairline icon set — 1.25 stroke to match the 1px thread language. Decorative by default. */
export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name]} />
    </svg>
  )
}
