import type { ReactNode } from "react";

// ──────────────────────────────
// Payment-method icons: the footer's bottom bar and the book page's optional row (PdpPaymentIcons).
// ──────────────────────────────
export const PAYMENT_ICONS: Record<string, ReactNode> = {
  visa: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.166 14.281l2.42-13.562h3.873l-2.42 13.562h-3.873zm11.393-13.064c-.754-.298-1.922-.619-3.376-.619-3.702 0-6.31 1.944-6.329 4.743-.03 2.062 1.868 3.208 3.292 3.896 1.458.706 1.95 1.155 1.942 1.785-.015.965-1.171 1.408-2.253 1.408-1.503 0-2.31-.225-3.535-.76l-.497-.238-.529 3.256c.883.402 2.512.75 4.205.766 3.935 0 6.5-1.922 6.539-4.896.02-1.618-.975-2.853-3.116-3.87-.225-.112-.45-.224-.652-.328-1.178-.568-1.579-.955-1.571-1.53.015-.515.586-1.042 1.86-1.042 1.053-.016 1.815.223 2.408.47l.285.126.547-3.336zM7.568 1.22H3.771c-.883 0-1.545.26-1.936 1.183l-5.416 11.878h4.067l.808-2.215h4.975l.471 2.215h3.585L7.568 1.22zm-2.463 7.82l1.545-4.237.887 4.237H5.105zm18.802-8.32H20.73c-.63 0-1.109.356-1.343.916l-6.427 12.665h4.067l.812-2.25h4.975l.471 2.25h3.582L23.907.72z" />
    </svg>
  ),
  mastercard: (
    <svg className="h-4 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="7.5" r="7.5" opacity="0.8" />
      <circle cx="16.5" cy="7.5" r="7.5" opacity="0.6" />
    </svg>
  ),
  amex: (
    <svg className="h-4 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="4" y="11" fontSize="7" fontWeight="bold" fontFamily="sans-serif">AX</text>
    </svg>
  ),
  paypal: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.825 3.328a2.535 2.535 0 00-.518-.088 6.002 6.002 0 00-1.157-.1c-1.464 0-2.88.225-4.148.653-.518.175-.852.483-1.037.954l-1.87 8.358h-3.41l2.584-11.53c.18-.8 1.054-1.282 1.867-1.282h4.5c.95 0 1.764.218 2.378.647.614.43 1.002.99 1.134 1.637.133.648-.052 1.306-.554 1.936a4.52 4.52 0 01-1.769 1.418z" />
      <path d="M12.922 7.078c.185-.47.52-.779 1.037-.954 1.268-.428 2.684-.653 4.148-.653a6.002 6.002 0 011.157.1c.175.022.35.05.518.088.75.163 1.258.625 1.488 1.32.228.694.137 1.467-.282 2.215-.49 1.026-1.4 1.844-2.585 2.32a5.556 5.556 0 01-2.115.42H13.67l-.946 4.168h-3.41L11.055 7.15l1.867-.072z" />
    </svg>
  ),
  applepay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.59 7.07c0-1.74 1.41-2.73 1.48-2.78-.81-1.18-2.07-1.34-2.52-1.38-1.07-.11-2.09.63-2.63.63-.54 0-1.38-.62-2.27-.6-1.17.02-2.26.68-2.86 1.73-1.22 2.11-.31 5.23.87 6.93.58.83 1.26 1.76 2.16 1.73.87-.03 1.2-.56 2.26-.56 1.05 0 1.35.56 2.26.54.93-.02 1.52-.84 2.1-1.68.67-.97.94-1.92.96-1.97-.02-.01-1.85-.71-1.87-2.82zM14.73 1.77c.48-.58.8-1.38.71-2.18-.69.03-1.53.46-2.02 1.03-.42.48-.79 1.3-.7 2.08.77.06 1.53-.35 2.01-.93z" />
    </svg>
  ),
  googlepay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="3" y="11" fontSize="7" fontWeight="bold" fontFamily="sans-serif">GPay</text>
    </svg>
  ),
  afterpay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="2" y="10" fontSize="5" fontWeight="bold" fontFamily="sans-serif">afterpay</text>
    </svg>
  ),
  klarna: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="2" y="10" fontSize="6" fontWeight="bold" fontFamily="sans-serif">Kl.</text>
    </svg>
  ),
};
