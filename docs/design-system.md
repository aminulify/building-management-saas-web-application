# 🏢 AMADERGHOR SaaS: Glassmorphism Design System & UI/UX Master Prompt

You are an expert Frontend Architect and UI/UX Designer. Your task is to build a comprehensive, production-ready **Glassmorphism Design System** for **"AmaderGhor"**, a multi-role real estate and property management SaaS web application. The design must be fully responsive across mobile, tablet, and desktop, supporting dynamic dual-language switching (English & Bengali).

---

## 🎨 1. CORE VISUAL STYLE: GLASSMORPHISM
The entire application must adopt a sleek **Glassmorphism (Frosted Glass)** visual aesthetic set against a multi-layer soft gradient background wash.

### **Background Atmosphere**
- Global CSS Background: `linear-gradient(135deg, #e0f2fe 0%, #f3e8ff 40%, #fce7f3 70%, #ffedd5 100%)` with `background-attachment: fixed`.

### **Glass Card Mechanics (`.glass-card`)**
- **Background:** `rgba(255, 255, 255, 0.65)` (65% translucent white).
- **Backdrop Filter:** `blur(16px) saturate(180%)`.
- **Borders:** `1px solid rgba(255, 255, 255, 0.5)` (subtle reflective top/left highlight).
- **Box Shadow:** `0 20px 40px -15px rgba(0, 0, 0, 0.05), inset 0 0 12px rgba(255, 255, 255, 0.6)`.
- **Border Radius:** `20px` to `24px` (`rounded-2xl` / `rounded-3xl`).

---

## ✍️ 2. TYPOGRAPHY & DUAL-LANGUAGE SYSTEM

The application requires strict separation and styling for English and Bengali typography.

# Typography & Heading Styling Guidelines

## A. English Font Rules

### 1. General Text — Poppins

Use **Poppins** as the primary font for all standard English content throughout the application.

Apply Poppins to:
- Paragraphs and descriptions
- Navigation menus
- Buttons and CTA text
- Table contents
- Form labels and inputs
- Dashboard content
- General UI text

**Font Weights:**
- Regular: 400
- Medium: 500
- SemiBold: 600
- Bold: 700

### 2. Titles, Subtitles & Important Words — Playfair Display Italic

Use **Playfair Display Italic** to create visual emphasis in important English typography.

Apply it to:
- Major page titles
- Hero section headings
- Section titles and subtitles
- Important phrases
- Selected highlighted words within heading sentences

**Font Weights:**
- Medium Italic: 500
- SemiBold Italic: 600
- Bold Italic: 700

### 3. Gradient Text Color

All Playfair Display Italic text must use the application's existing brand gradient.

**Brand Gradient:**

`linear-gradient(135deg, #F413E6 0%, #48BDFA 100%)`

**CSS Implementation:**

```css
.gradient-heading {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-weight: 600;
  background: linear-gradient(135deg, #F413E6 0%, #48BDFA 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
```

---

## B. Heading Sentence Styling Rules

**Important:** Do not automatically apply Playfair Display to the entire heading sentence. Instead, analyze each heading and select its most meaningful word or phrase for special emphasis.

Keep the remaining words in Poppins.

### Example 1

**Original Heading:**

Start your journey with us.

**Typography Breakdown:**

| Text | Font | Style |
|---|---|---|
| Start your | Poppins | Original text color |
| journey | Playfair Display Italic | Brand gradient |
| with us. | Poppins | Original text color |

**Visual Implementation:**

```jsx
<h1 className="font-poppins">
  Start your{" "}
  <span className="gradient-heading">
    journey
  </span>{" "}
  with us.
</h1>
```

### Example 2

**Original Heading:**

Find your perfect home today.

**Typography Breakdown:**

| Text | Font | Style |
|---|---|---|
| Find your | Poppins | Original text color |
| perfect home | Playfair Display Italic | Brand gradient |
| today. | Poppins | Original text color |

### Example 3

**Original Heading:**

Manage your properties effortlessly.

**Typography Breakdown:**

| Text | Font | Style |
|---|---|---|
| Manage your | Poppins | Original text color |
| properties | Playfair Display Italic | Brand gradient |
| effortlessly. | Poppins | Original text color |

---

## C. Implementation Requirements

1. Analyze every heading on the current page before implementing the typography.
2. Identify the most meaningful, visually impactful, or emotionally engaging word or short phrase in each heading.
3. Apply Playfair Display Italic and the brand gradient only to the selected word or phrase.
4. Keep all remaining heading text in Poppins.
5. Preserve the original heading sentence, wording, and meaning.
6. Select one primary highlighted word or phrase per heading. Avoid excessive highlighting.
7. Use the exact same gradient as the application's primary buttons: `#F413E6` to `#48BDFA`.
8. Maintain consistent font weights, spacing, line heights, and visual hierarchy.
9. Ensure highlighted text wraps naturally on smaller screens.
10. Reuse existing font definitions and CSS/Tailwind utilities wherever possible.
11. Do not introduce additional fonts or gradient colors.
12. Apply the rules consistently across hero sections, page headers, section headings, feature sections, and CTA headings.

## D. Final Design Direction

The overall typography should combine:

- **Poppins:** Clean, modern, readable, and professional.
- **Playfair Display Italic:** Elegant, expressive, and visually distinctive.
- **Brand Gradient:** Vibrant pink-to-blue gradient matching the application's buttons and primary branding.

**Expected Result:** Every heading should maintain a clean Poppins typography foundation while its most important word or phrase stands out through elegant Playfair Display Italic typography and the existing brand gradient.

Apply these guidelines only to the current page being implemented. Preserve the existing design system and do not modify unrelated components.

### **B. Bengali Font Rules**
* **Bengali Text (Anek Bangla):** Use **Anek Bangla** for all Bengali UI elements, headers, tables, and buttons.
  - *Weights:* Regular (400), Medium (500), SemiBold (600), Bold (700).

---

## 🎨 3. COLOR PALETTE & STATUS BADGES

### **Brand Accents**
- Primary Magenta: `#EC008C`
- Vivid Purple: `#7B2FF7`
- Sky Blue: `#00AEEF`
- Deep Navy (Primary Text/Headings): `#0F172A`

### **Status & Tint Badges**
- **Active / Success (Green):** BG `rgba(220, 252, 231, 0.8)`, Text `#15803D`, Border `#86EFAC`
- **Pending / Warning (Yellow):** BG `rgba(254, 243, 199, 0.8)`, Text `#B45309`, Border `#FDE68A`
- **Critical / Unpaid / Banned (Red):** BG `rgba(254, 226, 226, 0.8)`, Text `#B91C1C`, Border `#FCA5A5`
- **VIP / Admin / Tier (Purple):** BG `rgba(243, 232, 255, 0.8)`, Text `#6B21A8`, Border `#D8B4FE`

---

## 🧩 4. COMPONENT LIBRARY SPECIFICATIONS

1. **Buttons:**
   - **Primary CTA:** Gradient background (`linear-gradient(135deg, #F413E6, #48BDFA)`), white text, `rounded-xl`, soft glow shadow on hover.
   - **Glass Secondary Button:** `rgba(255, 255, 255, 0.5)` background, `1px solid rgba(255, 255, 255, 0.8)`, dark navy text.
   - **Destructive Button:** `rgba(239, 68, 68, 0.15)` background, `#DC2626` text, `1px solid rgba(239, 68, 68, 0.3)`.

2. **Form Inputs & Search Bars (`.glass-input`):**
   - Background: `rgba(255, 255, 255, 0.5)` with `backdrop-blur(8px)`.
   - Focus State: Border color `#00AEEF` with a soft blue halo shadow (`0 0 0 3px rgba(0, 174, 239, 0.25)`).

3. **Tables & Data Grids:**
   - Header Row: Translucent `rgba(241, 245, 249, 0.6)` with bold uppercase text.
   - Row Hover: Smooth `translateY(-1px)` lift with increased glass opacity.
   - Dividers: `1px solid rgba(226, 232, 240, 0.5)`.

4. **Modals & Overlays:**
   - Backdrop: `rgba(15, 23, 42, 0.4)` with `backdrop-blur(12px)`.
   - Shell: Glass container (`rgba(255, 255, 255, 0.85)` background, `rounded-3xl`).

---

## 📱 5. RESPONSIVE LAYOUT & LANGUAGE SWITCHING

- **Desktop (1280px+):** Fixed floating left glass sidebar (300px) + full main workspace card grid.
- **Tablet (768px – 1079px):** Collapsible sidebar into a slim icon bar; KPI summary cards in a 2x2 grid.
- **Mobile (< 768px):** Sidebar converts into a slide-over mobile drawer with a hamburger menu; data tables feature horizontal touch scrolling.
- **Language Switcher:** A toggle pill (`[ BN | EN ]`) integrated into the navigation bar that dynamically swaps text strings across the entire DOM without breaking layout alignment.