import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const NewIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
);
export const OpenIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3.5 7.5h6l2-2h9v13h-17z" />
    <path d="m3.5 10 3 8.5h11l3-8.5z" />
  </IconBase>
);
export const SaveIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 4h12l2 2v14H5z" />
    <path d="M8 4v6h8V4M8 20v-6h8v6" />
  </IconBase>
);
export const SaveAsIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 4h10l3 3v5" />
    <path d="M5 4v16h7" />
    <path d="M8 4v6h7V4" />
    <path d="m14 19 5-5 2 2-5 5-3 1z" />
  </IconBase>
);
export const RecentIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </IconBase>
);
export const SunIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </IconBase>
);
export const MoonIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" />
  </IconBase>
);
export const SystemIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </IconBase>
);
export const CloseIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </IconBase>
);
