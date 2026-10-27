## 2024-05-23 - Cart Drawer Accessibility Improvements
**Learning:** Icon-only buttons without `aria-label`s were found in the Cart Drawer (close, increment, decrement, remove). Screen reader users are severely disadvantaged when these interactive elements lack semantic labeling, making basic interactions like adjusting order quantity very difficult.
**Action:** When adding or reviewing features with icon-only buttons (like modals, quantity adjusters, or cart actions), ensure that an `aria-label` or visually hidden text is always present to describe the action.

## 2024-05-24 - Admin Theme Editor Accessibility Improvements
**Learning:** Similar to the Cart Drawer, the Admin Theme Editor lacked `aria-label`s on icon-only buttons used for reordering and deleting sections and menu links. These administrative interfaces are equally important to keep accessible for content managers relying on screen readers.
**Action:** Consistently verify that reorder arrows (up/down) and delete (trash/X) icon buttons include `aria-label`s, especially in complex list-editing interfaces like navigation menus or page builders.

## 2024-05-25 - Carousel Navigation Accessibility Improvements
**Learning:** Icon-only and indicator-dot buttons in product and hero section carousels (e.g., `ChevronLeft`, `ChevronRight`, and dot indicators) lacked `aria-label`s. Without these, screen reader users cannot perceive the navigation controls for important visual content like product images and hero slides.
**Action:** Always ensure that carousel navigation elements, including previous/next arrows and pagination dots, have descriptive `aria-label`s (e.g., "Previous slide", "Next photo", "Go to slide 2") so that the interactive components of image galleries and sliders are fully accessible.

## 2026-06-23 - Admin Dashboard Help Icon Accessibility Improvement
**Learning:** Found an icon-only `HelpCircle` button in the admin dashboard navigation area missing an `aria-label`. Similar to previous findings in the theme editor and cart drawer, interactive elements meant to guide or support users must be accessible to screen reader users, especially in critical interfaces like the admin dashboard.
**Action:** Consistently ensure that support/help buttons and other navigational icon-only buttons in administrative panels are properly labeled with descriptive `aria-label`s to maintain equitable access for content managers relying on assistive technology.

## 2026-06-24 - Information Panel Accessibility Improvement
**Learning:** Found an icon-only `X` button inside the Information (About) panel missing an `aria-label`. Interactive elements meant to dismiss or close overlays are critical for keyboard and screen reader users and must be explicitly labeled so users know how to exit a view.
**Action:** Always ensure that dismissive buttons, such as modal or panel close controls, are properly labeled with descriptive `aria-label`s to maintain equitable access.
