# MASTER BRIEF — Montessori domoškola | Marketing Website

> Owner's master brief, saved verbatim on 2026-10-24.
> **Owner decision (2026-10-24):** implement the full brief on a Cloudflare-native stack (static Astro pages, Pages Functions, D1, transactional email, Cloudflare Access for admin, git-based CMS) instead of Next.js + PostgreSQL. Section 10 explicitly allows this; the ADR in `docs/adr/` records the details.
> **Content:** placeholders until the owner supplies real facts. Never invent organisational facts.
> **Owner decisions (2026-10-24):** working name for previews is the neutral "Domoškola" with the line "Komunitné vzdelávanie pre 1.–4. ročník" (configurable); hero option B (type + illustrated landscape) for launch; no dark theme in v1; pnpm 10.34.6 (corepack 0.24 on the dev machine cannot run pnpm 12); first pages.dev preview deploy approved, noindex until content is verified.

## 1. ROLE & OBJECTIVE

You are a senior multidisciplinary team consisting of:

- Senior Product Designer and UX/UI Specialist
- Brand Designer
- Conversion Rate Optimization (CRO) Expert
- Educational Marketing Strategist
- SEO and Content Strategist
- Senior Full-Stack Developer
- Accessibility Specialist
- GDPR and Security Specialist

Your task is to **design and implement a complete, production-ready, multilingual marketing website** for a small alternative primary education community (domoškola) based in Slovakia.

This must not be a generic school website template.

The website should convey warmth, trust, intellectual curiosity, freedom, meaningful learning, respect for children, and a close relationship with nature.

The primary business objective is to attract suitable families, explain the educational philosophy, generate qualified inquiries, and convert interested parents into applicants.

Build the actual functional website, not just a design concept or static mockup.

---

## 2. PROJECT BACKGROUND

### Educational concept

The project is a small alternative educational community for children attending grades 1–4 of primary school, approximately ages 6–10.

The educational philosophy combines four complementary approaches:

**1. Montessori-inspired education**
- Prepared and stimulating learning environment
- Respect for individual learning pace
- Independence and personal responsibility
- Hands-on learning and self-discovery
- Meaningful freedom within clear boundaries
- Mixed-age learning opportunities where suitable

**2. Respectful approach to children**
- Respectful and nonviolent communication
- Emotional safety and psychological wellbeing
- Mutual respect between children and adults
- Positive conflict resolution
- Healthy relationships and cooperation
- Partnership with parents

**3. Constructivist education**
- Children actively construct their understanding
- Discovery-based and inquiry-based learning
- Learning through experience and experimentation
- Project-based and interdisciplinary activities
- Asking questions and finding solutions
- Critical thinking rather than memorization

**4. Hejný mathematics method**
- Mathematical understanding through discovery
- Building mental mathematical structures
- Learning through structured environments
- Collaboration, discussion and reasoning
- Mathematical confidence
- Understanding why a solution works, rather than mechanically following procedures

Clearly distinguish between Montessori-inspired methodology and an officially accredited Montessori institution. Do not claim certification without verification.

The same applies to the Hejný method: describe the pedagogical approach accurately, without claiming official certification.

### Target audience

Parents of children in grades 1–4 of primary school.

Primary geographic target areas:

- Banská Bystrica and surrounding municipalities
- Ružomberok and surrounding municipalities
- Liptovský Mikuláš and surrounding municipalities

The website should communicate a regional reach without falsely claiming that the school operates physical locations in all three cities.

The exact physical location is currently unspecified. Use configurable content for the actual venue and commuting information.

### Language requirements

The complete website must support:

- Slovak (SK) — default
- Czech (CZ)
- English (EN)

All navigation, marketing content, educational explanations, forms, validation messages, SEO metadata, error states, transactional emails and confirmation pages must be localized.

Routes:

- `/sk`
- `/cs`
- `/en`

Language switching must preserve the current page where possible.

---

## 3. BRAND STRATEGY

### Desired positioning

A modern, caring, intellectually stimulating educational community where children learn naturally, actively, and with respect.

The brand should appeal to thoughtful parents who are dissatisfied with purely traditional, memorization-oriented education, but still expect clear educational goals, structure and accountability.

Avoid portraying conventional schools as inferior.

### Emotional associations

The website should evoke:

- Trust
- Safety
- Calmness
- Curiosity
- Authenticity
- Belonging
- Freedom to explore
- Respect for individuality
- Joy of discovery
- Connection to nature

### Brand voice

Warm, calm, confident, intelligent and accessible.

Speak primarily to parents, not children.

Use plain language rather than academic jargon.

Explain the educational benefits with concrete examples.

Avoid exaggerated or unverified promises such as guaranteed academic success, exceptional intelligence, or universal outcomes for all children.

### Proposed brand messaging

Primary headline:

**„Miesto, kde deti objavujú svet vlastným tempom.“**

Alternative headline:

**„Škola, kde zvedavosť rastie a učenie dáva zmysel.“**

Supporting copy:

„Vytvárame rešpektujúce prostredie pre deti 1. až 4. ročníka, kde sa učenie opiera o objavovanie, skúsenosti, samostatnosť a spoluprácu. Spájame princípy Montessori, konštruktivistické vzdelávanie a Hejného matematiku.“

Primary CTA:

**„Prihlásiť dieťa“**

Secondary CTA:

**„Spoznajte náš prístup“**

Additional CTA:

**„Dohodnúť si stretnutie“**

The brand name must be configurable. Until provided, use a tasteful working name or neutral placeholder.

Do not invent a real organization, staff member, address, accreditation, testimonial or registration number.

---

## 4. VISUAL DESIGN SYSTEM

Create a premium, distinctive editorial-style visual identity.

The result should look like a thoughtfully designed independent educational institution, not a corporate SaaS landing page.

### Design inspiration

Combine:

- Scandinavian minimalism
- Montessori-inspired natural materials
- Organic shapes
- Editorial typography
- Warm photography
- Playful but sophisticated educational illustrations
- Generous whitespace
- Subtle microinteractions

### Color palette

Suggested:

- Warm cream: `#F8F5ED`
- Forest green: `#315C4C`
- Sage green: `#A9BEA2`
- Terracotta: `#C77958`
- Muted yellow: `#E8C875`
- Deep charcoal: `#29302D`

Use a restrained palette with strong contrast and accessible typography.

### Typography

Use a combination of:

- Elegant, humanist display font for headings
- Highly readable modern sans-serif for body text

Ensure full support for Slovak and Czech diacritics.

### Visual language

Use:

- Natural textures
- Wood, paper, clay and textiles
- Plants and outdoor learning environments
- Educational tools and manipulatives
- Mathematical exploration
- Books, drawing and creative work
- Subtle illustrations of discovery, exploration and growth

Prefer authentic licensed photography.

If authentic photographs are unavailable, use suitable licensed imagery or clearly illustrative artwork. Do not represent AI-generated children or staged scenes as actual students from this community.

### Responsive design

Create exceptionally polished layouts for:

- Mobile: 360–430 px
- Tablet: 768–1024 px
- Desktop: 1280–1920 px

Mobile-first implementation.

---

## 5. INFORMATION ARCHITECTURE

Create the following pages:

### 5.1 Home — `/`

The homepage must be a comprehensive but conversion-focused landing page.

Sections:

**A. Hero section**
- Emotional, memorable headline
- Clear explanation of the educational approach
- Attractive authentic or illustrative visual
- Primary enrollment CTA
- Secondary educational approach CTA
- Visible information: grades 1–4 and geographic target area

**B. Our philosophy**
Introduce the core belief that children learn through relationships, discovery and active participation.

**C. Four educational pillars**

Four visually distinctive components:

1. Montessori principles
2. Respectful education
3. Constructivist learning
4. Hejný mathematics

Each must provide a short explanation, parent-focused benefits and a link to learn more.

**D. A day in our community**

Show an illustrative daily rhythm including:

- Morning arrival and connection
- Independent exploration
- Project work
- Mathematics and language
- Outdoor activities
- Shared reflection

Label it as an example rather than a confirmed operational timetable.

**E. What children develop**
- Independence
- Critical thinking
- Cooperation
- Mathematical reasoning
- Communication skills
- Creativity
- Responsibility
- Curiosity

**F. How learning works**

Use real educational examples.

Example: children learn measurement by building, measuring and comparing objects, instead of only completing worksheets.

Example: children develop mathematics through exploration, models, discussion and Hejný mathematical environments.

**G. Our educational environment**

Space for photo gallery, learning materials and outdoor activities.

Use placeholders for real venue photos until available.

**H. For whom is the community suitable?**

Explain which families and children may benefit from the approach, while avoiding discriminatory selection language.

**I. Regions**

Communicate accessibility for families from:

- Banská Bystrica
- Ružomberok
- Liptovský Mikuláš

Include regional SEO content without creating fictional operating locations.

**J. How enrollment works**

Create a clear, three- or four-step enrollment process:

1. Parent contacts the community
2. Introductory conversation
3. Mutual introduction and educational fit discussion
4. Agreement on next steps and enrollment requirements

Label the process as proposed until confirmed.

**K. Frequently Asked Questions**

Show an expandable FAQ component.

**L. Final conversion section**

Strong parent-oriented call to action.

**M. Footer**
- Navigation
- Contact
- Language switching
- Privacy policy
- Cookies
- Legal information
- Social media links (only when actual URLs are provided)

---

### 5.2 Our Approach — `/approach`

Create a detailed explanation of educational philosophy.

Dedicated sections for:

- Montessori principles
- Respectful education
- Constructivism
- Hejný mathematics
- Learning through projects
- Emotional development
- Individual educational pace
- How academic progress is observed and evaluated

For each methodology explain:

1. What it means
2. How it works in practice
3. Concrete examples
4. Benefits for children
5. What parents can expect

Explain how the four approaches complement one another.

Avoid misleading claims that all principles are universally applicable in exactly the same way.

---

### 5.3 A Day at School — `/day-at-school`

Present a visually engaging explanation of an illustrative school day.

Include:

- Daily rhythm
- Independent and guided learning
- Learning outdoors
- Creative activities
- Time for rest
- Social interactions
- Mathematics and language development
- Shared reflection

The schedule must be editable in the content management system.

Mark unknown operational details as pending confirmation.

---

### 5.4 For Parents — `/for-parents`

Provide practical information.

Include:

- Grades and intended ages
- Geographic accessibility
- Learning structure
- Communication with parents
- Educational goals
- How progress is monitored
- Cooperation with the child's registered school, where applicable
- Attendance expectations
- Food and outdoor activities
- Indicative admission process
- Tuition and fees, only when confirmed
- Practical information for visiting the community

**Legal and organizational status**

Domoškola is not automatically the same as an officially registered primary school.

The website must clearly distinguish between a registered primary school, a community learning group and individual/home education.

Create an editable, visible section explaining the actual legal operating model, links to verified partner schools (if any), and responsibilities of parents.

Do not claim accreditation, school status, legal entitlement to home education or fulfillment of compulsory attendance without verified facts.

---

### 5.5 Enrollment — `/enrollment`

Create a complete enrollment landing page.

Include:

- Overview of the educational offer
- Intended grade levels
- Eligibility and next steps
- Admission process
- Aplication form
- Confirmation of submission
- Information about how personal data is processed

The application is an expression of interest, not an automatic confirmation of acceptance.

---

### 5.6 Contact — `/contact`

Include:

- Contact form
- Public contact information when provided
- Editable location
- Regional coverage
- Optional map once the real venue is confirmed
- Ability to request a visit or introductory meeting

---

### 5.7 FAQ — `/faq`

Build a searchable, categorized FAQ.

Suggested categories:

- Educational philosophy
- Domoškola and legal status
- Enrollment
- Daily routine
- Parent cooperation
- Costs
- Location and transport
- Language and learning support

Questions should include:

- What is the difference between domoškola and a traditional school?
- How is compulsory education fulfilled?
- What school is the child formally enrolled in?
- How is progress evaluated?
- Can a child transfer back to a conventional school?
- How does Hejný mathematics work?
- How much time is spent outdoors?
- How are conflicts between children handled?
- Do parents need to participate?
- Can families from all three regions apply?
- What is the cost of attendance?

Do not invent definitive answers when operational information is still unknown.

---

## 6. CONTACT FORM

Create a fully functional contact form.

### Fields

- Parent's name — required
- Email — required
- Phone — optional
- Region — select: Banská Bystrica, Ružomberok, Liptovský Mikuláš, Other
- Subject — select: General inquiry, Introductory visit, Enrollment, Other
- Message — required
- Privacy notice with link to privacy policy and legally appropriate acknowledgment
- Honeypot spam protection

### Behavior

- Client-side and server-side validation
- Accessible validation errors
- Loading state
- Success state
- Error recovery
- Spam and abuse protection
- Confirmation email to sender
- Notification email to administrator
- Secure storage of submissions where configured

Never expose administrator credentials or private keys in client-side code.

---

## 7. ENROLLMENT / APPLICATION FORM

Create a thoughtfully designed multi-step enrollment form.

Use a clear progress indicator and mobile-friendly layout.

### Step 1: Parent information

- Parent or legal guardian's full name
- Email
- Phone
- Municipality / region
- Preferred communication language: SK / CZ / EN

### Step 2: Child information

Collect only information necessary for the initial application:

- Child's first name or preferred name
- Intended grade: 1, 2, 3 or 4
- Intended school year
- Current educational arrangement — optional

Do not collect birth identification numbers, medical diagnoses, detailed behavioral histories or other sensitive child information in the initial marketing form.

### Step 3: Expectations

- Why are you interested in this educational approach?
- What is important for your child's learning environment?
- What would you like to know?
- Preferred next step: introductory call / visit / more information

### Step 4: Review and submit

- Summary of provided information
- Ability to edit previous steps
- Privacy notice
- Required acknowledgement of data-processing information
- Clear submit button

Do not request blanket marketing consent as a mandatory condition of application. Any separate marketing consent must be optional and independently recorded.

### After submission

Display:

**„Ďakujeme za váš záujem. Vašu prihlášku sme prijali a ozveme sa vám ohľadom ďalšieho postupu.“**

Include corresponding Czech and English translations.

Send a confirmation email that avoids unnecessary child-related details.

### Application management

Implement a simple secure administration interface or use a suitable headless CMS.

Application statuses:

- New
- Contacted
- Introductory meeting planned
- In discussion
- Accepted
- Waitlisted
- Closed

These statuses are internal. Public-facing text must distinguish application receipt from final enrollment.

Admin capabilities:

- List submitted inquiries and applications
- Filter by status, region and grade
- Search applications
- View details with role-based authorization
- Update status
- Add internal notes
- Export records to CSV
- Delete records according to retention rules
- Record administrative changes in an audit log

Protect all administrative routes from public access.

---

## 8. MULTILINGUAL CONTENT

Implement full internationalization.

Use a maintainable translation structure.

Support:

- Slovak
- Czech
- English

Do not simply machine-translate terminology literally.

Use natural educational terminology appropriate for each language.

Examples:

SK: rešpektujúci prístup, domoškola, Hejného matematika

CZ: respektující přístup, domácí vzdělávání / vzdělávací skupina, Hejného metoda

EN: respectful education, home-education community, Hejný mathematics method

Adapt SEO titles, descriptions and structured content to each language.

Do not present an English translation as evidence that formal instruction is delivered in English. Instruction languages must be explicitly confirmed separately.

---

## 9. SEARCH ENGINE OPTIMIZATION

Implement technical and content SEO.

### Technical requirements

- Semantic HTML
- Localized metadata
- Canonical URLs
- Hreflang tags for SK/CZ/EN
- Open Graph metadata
- Sitemap.xml
- Robots.txt
- Appropriate structured data
- Mobile performance optimization
- Image optimization
- Internal linking
- Clear URL structure

Use Organization structured data unless verified eligibility for a more specific educational organization type exists.

### SEO topic clusters

Optimize naturally for relevant searches, including:

- domoškola Banská Bystrica
- domoškola Ružomberok
- domoškola Liptovský Mikuláš
- Montessori vzdelávanie
- rešpektujúca škola
- alternatívne vzdelávanie
- individuálne vzdelávanie
- Hejného matematika
- konštruktivistické vzdelávanie
- vzdelávanie 1. stupeň ZŠ

Do not use keyword stuffing or misleading doorway pages.

Create useful educational articles to support organic discovery.

### Blog / Knowledge Center

Design an optional educational content section.

Initial article concepts:

1. Čo je rešpektujúce vzdelávanie?
2. Ako funguje Montessori prístup na prvom stupni?
3. Hejného matematika: ako deti objavujú čísla
4. Čo znamená konštruktivistické učenie?
5. Domoškola verzus tradičná škola
6. Ako si vybrať vzdelávacie prostredie pre prváka?
7. Ako podporovať samostatnosť dieťaťa?
8. Ako funguje individuálne vzdelávanie na Slovensku?

All legal explanations must be verified against current applicable Slovak rules before publication.

---

## 10. TECHNOLOGY STACK

Recommended architecture:

- Next.js with App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Motion for subtle animation
- next-intl for internationalization
- React Hook Form
- Zod for validation
- PostgreSQL with Prisma
- Transactional email provider via server-side integration
- Secure admin authentication
- A suitable headless CMS or editable content administration
- Cloud-compatible deployment

Alternative deployment to Cloudflare is acceptable if the selected runtime, persistence, email integration and auth components are compatible.

Use a modular architecture to allow future extension.

### Security requirements

- Server-side authorization
- Input validation
- CSRF protection where applicable
- Rate limiting
- Anti-spam controls
- Safe data handling
- Security headers
- Secure environment variables
- No exposed credentials
- Log sanitization
- Access control for parent and child information

### GDPR requirements

Implement GDPR-aware design from the beginning.

- Data minimization
- Clear privacy notices
- Separate legal bases for inquiry handling and optional marketing
- No prechecked marketing consent
- Controlled retention and deletion
- Data access restrictions
- Processor and hosting documentation
- Appropriate data subject rights handling
- Cookie consent only where legally required
- Block nonessential tracking until valid consent where necessary

Do not invent the identity of the data controller, storage period or finalized legal basis; make these configurable and flag them for legal review.

---

## 11. ACCESSIBILITY

Target WCAG 2.2 AA.

Ensure:

- Keyboard navigation
- Visible focus states
- Accessible forms
- Screen reader labels
- Proper heading hierarchy
- Reduced motion support
- Color contrast
- Clear error messages
- Minimum comfortable touch targets
- Correct language attributes
- Accessible mobile navigation

---

## 12. PERFORMANCE

Target:

- Lighthouse performance 90+
- Lighthouse accessibility 95+
- Lighthouse SEO 95+
- Core Web Vitals within recommended thresholds

Optimize:

- Images
- Fonts
- JavaScript bundles
- Server rendering
- Caching
- Third-party scripts
- Animation performance

Do not optimize at the expense of accessibility or functionality.

---

## 13. CONVERSION OPTIMIZATION

The main conversion event is a completed enrollment-interest form.

Secondary conversions:

- Contact form submission
- Request for introductory visit
- Click on the enrollment page
- Request for information

Implement privacy-conscious conversion tracking with configurable analytics.

Design clear conversion paths:

Homepage → Educational approach → Enrollment → Submission

Homepage → Parent information → Contact

Homepage → FAQ → Introductory meeting request

Use CTAs naturally throughout the site.

Do not rely on manipulative urgency, invented scarcity or unverified social proof.

---

## 14. CONTENT MANAGEMENT

The administrators must be able to update without programming:

- Main headings
- Educational philosophy text
- Daily schedule
- Gallery
- FAQ
- Enrollment availability
- School year
- Tuition information
- Contact information
- Physical location
- Team members
- Blog articles
- Privacy policies
- Home page content
- Translations
- Application statuses

Provide seed/demo content separately from production content.

Flag unverified text as draft or requiring review.

---

## 15. VISUAL QUALITY REQUIREMENTS

The website must feel custom designed and polished.

Avoid:

- Generic stock-template design
- Corporate gradients
- Excessive cards
- Large generic icon grids
- Overwhelming animations
- Artificial testimonials
- Empty inspirational statements
- Inconsistent typography
- Overly childish illustrations

Prefer:

- Strong typography
- Attractive imagery
- Elegant editorial layouts
- Purposeful whitespace
- Natural transitions
- Organic compositions
- Distinctive educational storytelling
- Excellent mobile experience

Pay special attention to the hero section.

It should make parents immediately understand what this educational community offers and why it is worth exploring.

---

## 16. DELIVERABLES

Provide a complete working project, including:

1. Brand direction and design tokens
2. Information architecture
3. UX implementation
4. Fully responsive frontend
5. SK/CZ/EN content
6. Contact form and backend
7. Multi-step enrollment form and backend
8. Secure application management
9. CMS/editorial management
10. SEO configuration
11. GDPR-aware form and privacy infrastructure
12. Email integration
13. Automated tests
14. Environment configuration example
15. Deployment documentation
16. README

Include unit tests, integration tests and end-to-end tests for important workflows.

Test all languages, forms, validation flows, persistence, authentication and accessibility.

---

## 17. IMPLEMENTATION PLAN

Work in these phases:

### Phase 1 — Product and information architecture

Define key user journeys, page structure, content models and conversion funnels.

### Phase 2 — Brand and design system

Create a distinctive visual direction and reusable components.

### Phase 3 — Homepage

Implement the complete responsive homepage with real Slovak copy.

### Phase 4 — Remaining content pages

Implement educational explanations, FAQ, parent information and contact.

### Phase 5 — Forms and backend

Implement contact, application workflows, secure storage, email notifications and administration.

### Phase 6 — Internationalization and SEO

Complete Slovak, Czech and English versions.

### Phase 7 — QA

Perform automated and manual checks of functionality, responsiveness, accessibility, privacy and performance.

### Phase 8 — Production readiness

Prepare deployment, environment variables, admin configuration and documentation.

---

## 18. ACCEPTANCE CRITERIA

The project is complete only if:

- Every public page is responsive and functional.
- All three languages are available.
- No visible untranslated interface text remains.
- Both forms validate and save data correctly.
- Submission confirmation and administrator notification emails work.
- Administrative access is secured.
- Personal information is protected appropriately.
- Unknown operational or legal facts are not presented as confirmed.
- SEO metadata and language alternates are correct.
- The website passes accessibility testing.
- There are no dead links or nonfunctional CTAs.
- The production build succeeds.
- Tests pass.
- The site is ready for deployment after real organizational information and legally reviewed policies are supplied.

## 19. FINAL INSTRUCTION

Start by establishing the brand direction, website structure and design system.

Then implement the working application.

Make thoughtful decisions independently when requirements are not explicit, but do not invent actual organizational facts.

Prefer polished, functional output over lengthy explanations.

The final result must look and behave like a premium independent education website, capable of converting interested parents from the Banská Bystrica, Ružomberok and Liptovský Mikuláš regions into qualified applicants.
