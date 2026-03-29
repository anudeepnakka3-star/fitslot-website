# Design System Strategy: The Kinetic Sanctuary

## 1. Overview & Creative North Star
This design system is built upon the "Kinetic Sanctuary" North Star. For a gym booking application like FitSlot, the interface must balance the high energy of fitness with the calm, organized precision of a premium concierge service. 

We are moving beyond the "generic fitness app" by rejecting the cluttered, high-contrast grids common in the industry. Instead, we utilize **Editorial Spacing** and **Tonal Depth**. The layout is intentionally asymmetrical, using generous white space to create a "gallery" feel where your workout schedule is treated as a curated event rather than a chore. By layering soft surfaces and prioritizing typography over lines, we create an interface that feels breathable, expensive, and effortless.

---

## 2. Colors: Tonal Architecture
The palette is rooted in a "No-Line" philosophy. Traditional 1px borders create visual "noise" that traps the eye. We define structure through light and depth.

*   **The "No-Line" Rule:** Explicitly prohibit the use of solid `outline` or `outline-variant` tokens for sectioning content. Instead, use a background shift from `surface` (#f9f9fa) to `surface-container-low` (#f3f3f4) to define sections.
*   **Surface Hierarchy & Nesting:** 
    *   **Level 0 (Base):** `surface` (#f9f9fa) – The canvas.
    *   **Level 1 (Sectioning):** `surface-container-low` (#f3f3f4) – Subtle grouping for background areas.
    *   **Level 2 (Active Cards):** `surface-container-lowest` (#ffffff) – Used for primary interactive cards.
*   **The Glass & Gradient Rule:** For floating headers or navigation bars, use `surface-container-lowest` with a 80% opacity and a 20px backdrop-blur. 
*   **Signature Textures:** For primary CTAs and high-impact moments (like "Book Now"), use a subtle linear gradient from `primary` (#004ac6) to `primary_container` (#2563eb) at a 135-degree angle. This adds a "lithographic" depth that flat hex codes cannot achieve.

---

## 3. Typography: The Editorial Voice
We use **Inter** with a tight tracking (-2% for headlines) to mimic the authority of high-end Swiss typography.

*   **Display (The Hook):** `display-lg` and `display-md` are reserved for motivational stats or empty states. Use `on-surface` (#1a1c1d).
*   **Headline (The Narrative):** `headline-sm` is your workhorse for screen titles. Bold weights with generous `16` (5.5rem) top padding.
*   **Body (The Utility):** `body-lg` for descriptions. We prioritize `on-surface-variant` (#434655) for secondary information to maintain a soft contrast ratio that reduces eye strain during pre-workout booking.
*   **Label (The Metadata):** `label-md` in all-caps with +5% letter spacing for gym categories (e.g., "STRENGTH," "YOGA").

---

## 4. Elevation & Depth: Tonal Layering
We do not use structural lines. We use physics.

*   **The Layering Principle:** A "Booked Class" card should be `surface-container-lowest` (#ffffff) sitting on a `surface-container-low` (#f3f3f4) background. This creates a natural 3D lift without artificial shadows.
*   **Ambient Shadows:** For floating action buttons or modal sheets, use an ultra-diffused shadow: `0px 24px 48px rgba(26, 28, 29, 0.06)`. The tint is derived from `on-surface` to ensure the shadow feels like a natural obstruction of light.
*   **The "Ghost Border" Fallback:** If a border is required for a disabled state, use `outline-variant` (#c3c6d7) at 20% opacity.
*   **Glassmorphism:** Use for "Sticky" bottom booking bars. A semi-transparent `surface` with a `1.5` spacing inner padding creates a sophisticated "frosted" transition between the content and the action.

---

## 5. Components

### Buttons
*   **Primary:** `rounded-full`, `primary` gradient background, `on-primary` text. Use `spacing-4` for horizontal padding.
*   **Secondary:** `rounded-full`, `surface-container-high` background, `on-surface` text. No border.
*   **Tertiary:** Ghost style. `on-primary-fixed-variant` text with no container.

### Cards (The "Slot" Component)
*   **Container:** `surface-container-lowest` (#ffffff).
*   **Radius:** `xl` (1.5rem / 24px) for a modern, friendly feel.
*   **Rule:** Forbid the use of divider lines within cards. Use `spacing-3` (1rem) of vertical white space to separate the "Coach Name" from the "Class Time."

### Selection Chips (Time Slots)
*   **Unselected:** `surface-container-high` background, `on-surface-variant` text.
*   **Selected:** `primary` background, `on-primary` text, with a subtle `primary_fixed` outer glow.

### Input Fields
*   **Base:** `surface-container-low` background, `rounded-md`. 
*   **Interaction:** On focus, the background shifts to `surface-container-lowest` with a 1px "Ghost Border" at 20% opacity.

### Custom Component: The "Availability Pulse"
*   For gym slots, use a small 8px circle. Instead of a hard red/green, use `tertiary` (#943700) for "Filling Fast" and `primary` (#004ac6) for "Available," both with a soft 4px blur glow to simulate a physical LED.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `spacing-10` or `spacing-12` for top-level page margins. Space is a luxury brand's best friend.
*   **Do** use asymmetrical imagery. Align text to the left and let gym photography "bleed" off the right edge of the card.
*   **Do** use `on-secondary-container` for micro-copy and captions.

### Don't
*   **Don't** use 100% black. Always use `on-background` (#1a1c1d) to keep the "Sanctuary" vibe.
*   **Don't** use standard 1px dividers. If you must separate, use a 4px height `surface-container-highest` bar that doesn't span the full width of the screen.
*   **Don't** crowd the screen. If a user has to scroll to see the "Book" button, it adds to the sense of discovery rather than clutter.