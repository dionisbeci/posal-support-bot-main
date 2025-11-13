import type { SVGProps } from 'react';

export const Icons = {
  logo: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z" />
      <path d="M20.59 22c0-4.73-3.83-8.5-8.59-8.5s-8.59 3.77-8.59 8.5" />
      <path d="M18 10h.01" />
      <path d="M15 10h.01" />
    </svg>
  ),
};
