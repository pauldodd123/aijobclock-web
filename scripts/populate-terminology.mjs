#!/usr/bin/env node
/**
 * Populates the terminology_guides table with rich industry jargon
 * for all 9 AI Job Clock sectors.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/populate-terminology.mjs
 *
 * Or with a .env.local file (auto-detected if present).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load env from .env.local if present ──────────────────────────────────────
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // no .env.local — rely on environment variables
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// ── Terminology guides ────────────────────────────────────────────────────────

const guides = [
  {
    sector: "Technology",
    guide_content: `## Technology Industry Terminology

### Roles & Levels
- **IC (Individual Contributor)** — Engineer who writes code rather than managing people; the primary career track alongside management
- **Staff Engineer** — Senior IC who drives technical direction across multiple teams without direct reports
- **Principal Engineer** — Organisation-wide technical authority, typically equivalent to a Director in the management track
- **Distinguished Engineer / Fellow** — Apex IC roles at large companies (Google, Meta, Microsoft)
- **SRE (Site Reliability Engineer)** — Bridges software engineering and ops; owns uptime, incident response, and SLO/SLA compliance
- **DevOps Engineer** — Focuses on CI/CD pipelines, infrastructure as code, and developer tooling
- **EM (Engineering Manager)** — First-line people manager; typically oversees 6–10 engineers
- **TPM (Technical Program Manager)** — Coordinates cross-team delivery; owns roadmap and dependencies, not code

### Work Processes
- **Sprint** — Time-boxed iteration (usually 2 weeks) in Scrum; ends with a shippable increment
- **Standup / Daily Scrum** — Short daily sync (≤ 15 min) where engineers share progress, blockers, and plans
- **PR / MR (Pull Request / Merge Request)** — Proposed code change submitted for peer review before merging
- **Code Review** — Structured examination of a PR; focuses on correctness, style, and maintainability
- **CI/CD (Continuous Integration / Continuous Deployment)** — Automated pipelines that build, test, and deploy code on every commit
- **LGTM** — "Looks Good To Me"; informal approval on a PR
- **On-call** — Rotation where engineers carry a pager (or equivalent) and respond to production incidents
- **Postmortem / Blameless RCA** — Document written after an incident analysing root cause without assigning blame
- **RFC (Request for Comments)** — Written proposal for a significant design decision, circulated for feedback
- **Tech Debt** — Accumulated shortcuts in code that will require rework later

### Metrics & Concepts
- **SLO (Service Level Objective)** — Internal reliability target (e.g., 99.9% uptime)
- **SLA (Service Level Agreement)** — External contractual commitment derived from SLOs
- **SLI (Service Level Indicator)** — The actual measured metric (error rate, latency p99)
- **DORA Metrics** — Deployment frequency, lead time, change failure rate, MTTR — the gold standard for engineering velocity
- **Toil** — Repetitive manual operational work that scales with load; SREs aim to automate it away
- **P0 / P1 / Sev1** — Incident severity levels; P0/Sev1 = site down, all hands on deck
- **MTTR (Mean Time To Recovery)** — Average time to restore service after an incident
- **Throughput** — Story points or features shipped per sprint; a team-level metric
- **OKRs (Objectives and Key Results)** — Goal-setting framework common in tech companies
`,
  },
  {
    sector: "Finance",
    guide_content: `## Finance Industry Terminology

### Roles & Hierarchy (Investment Banking / Asset Management)
- **Analyst** — Entry-level (2–3 years post-undergrad); builds models, creates decks, manages data rooms
- **Associate** — Post-MBA or promoted analyst; owns sections of deals and manages analysts
- **VP (Vice President)** — Day-to-day deal manager; first "client-facing" title at most banks
- **Director / Senior VP** — Executes deals and starts developing own client relationships
- **MD (Managing Director)** — Revenue generator; owns client relationships and originates deals
- **Partner / Principal** — Equity ownership level in PE/VC; different from banking VP
- **Quant** — Quantitative analyst who builds algorithmic models for pricing, risk, or trading
- **Trader** — Executes buy/sell orders; prop traders use firm capital, agency traders execute for clients
- **Portfolio Manager (PM)** — Allocates capital and makes final investment decisions in a fund
- **IR (Investor Relations)** — Manages communication between fund/company and its investors/shareholders

### Financial Concepts
- **AUM (Assets Under Management)** — Total market value of assets a fund manages; the primary size metric
- **Alpha** — Return above the benchmark; skill-based outperformance (vs. beta = market return)
- **Beta** — Sensitivity of a portfolio to market moves; beta = 1 means moves with the market
- **Basis Points (bps)** — 1/100th of 1%; standard unit for quoting interest rates, spreads, fees
- **DCF (Discounted Cash Flow)** — Valuation method projecting future cash flows and discounting to present value
- **LBO (Leveraged Buyout)** — Acquisition funded primarily with debt; staple of private equity
- **EBITDA** — Earnings before interest, tax, depreciation and amortisation; common proxy for operating cash flow
- **IRR (Internal Rate of Return)** — Annualised return of an investment; the primary PE/VC performance metric
- **MOIC (Multiple on Invested Capital)** — Total return as a multiple of invested capital (e.g., 3.0x)
- **Carry / Carried Interest** — PE/VC fund manager's share of profits (typically 20%) above a hurdle rate
- **Hurdle Rate** — Minimum return (often 8%) LPs must receive before the GP earns carry
- **LP / GP** — Limited Partner (investor) and General Partner (fund manager) in a private fund
- **NAV (Net Asset Value)** — Fair value of a fund's holdings minus liabilities; unit price for open-end funds
- **Mark-to-Market** — Valuing positions at current market prices (vs. cost or model-based)
- **Spread** — Difference in yield between a bond and the benchmark (usually Treasuries); measures credit risk
- **P&L (Profit and Loss)** — Daily or periodic statement of trading gains and losses
- **VaR (Value at Risk)** — Statistical measure of potential loss over a given period at a confidence level

### Investment Banking Process
- **Pitch Book / Deck** — Presentation prepared by bankers to win a mandate or present deal analysis
- **CIM (Confidential Information Memorandum)** — Marketing document sent to potential buyers/investors in a sell-side process
- **LOI (Letter of Intent)** — Non-binding offer stating deal terms before full due diligence
- **Due Diligence (DD)** — Deep investigation of a target's financials, legal, and operations before closing
- **Roadshow** — Series of investor presentations before an IPO or bond issuance
- **Book** — Order book for an IPO or debt deal; "building the book" means collecting investor orders
`,
  },
  {
    sector: "Healthcare",
    guide_content: `## Healthcare Industry Terminology

### Clinical Roles & Training Hierarchy
- **Medical Student** — In training (years 1–4); rotates through clerkships in year 3–4
- **Intern** — PGY-1 (post-graduate year 1); first year of residency; carries heavy patient load
- **Resident** — PGY-2+; completes 3–7 years of specialty training under supervision
- **Fellow** — Subspecialty trainee post-residency (e.g., cardiologist doing interventional fellowship)
- **Attending** — Fully licensed, board-certified physician responsible for patient care and supervising trainees
- **Chief Resident** — Senior resident with administrative and teaching responsibilities
- **NP (Nurse Practitioner)** — Advanced practice nurse with prescribing authority; often works independently
- **PA (Physician Assistant / Physician Associate)** — Mid-level provider practising medicine under physician supervision
- **RN (Registered Nurse)** — Core bedside nursing role; manages care plans, medications, and patient monitoring
- **CNA (Certified Nursing Assistant)** — Provides direct patient care under RN supervision
- **Hospitalist** — Physician specialising in inpatient hospital care; no outpatient practice
- **Intensivist** — Critical care physician; runs the ICU

### Clinical Workflows
- **Rounds** — Daily bedside review of patients by the care team; attendings lead, residents present
- **Sign-out / Handoff** — Structured transfer of patient responsibility between shifts; SBAR format common
- **SBAR (Situation, Background, Assessment, Recommendation)** — Communication framework for clinical handoffs
- **Charting** — Documentation of clinical findings, assessments, and plans in the patient record
- **H&P (History and Physical)** — Initial clinical write-up documenting patient history and exam findings
- **SOAP Note** — Progress note format: Subjective, Objective, Assessment, Plan
- **Triage** — Prioritisation of patients by severity of condition; ED triage uses ESI scale (1–5)
- **Consult** — Request for specialist input on a patient; "pulling a consult" or "getting a curbside"
- **Curbside Consult** — Informal hallway advice from a specialist without formal documentation
- **Code / Code Blue** — Hospital emergency response to cardiac or respiratory arrest
- **Rapid Response** — Early warning activation for a deteriorating patient before full arrest

### Systems & Compliance
- **EMR / EHR (Electronic Medical / Health Record)** — Digital patient record system (Epic, Cerner, Meditech)
- **HIPAA** — Federal law governing the privacy and security of protected health information (PHI)
- **PHI (Protected Health Information)** — Any individually identifiable health data covered by HIPAA
- **ICD-10** — International diagnosis coding system used for billing and documentation
- **CPT Codes** — Current Procedural Terminology; five-digit codes used to bill procedures
- **RVU (Relative Value Unit)** — Unit measuring physician workload used to calculate pay in many health systems
- **Formulary** — List of approved medications covered by a hospital or insurance plan
- **Prior Auth (Prior Authorization)** — Insurance approval required before prescribing certain drugs or procedures
- **ADT (Admission, Discharge, Transfer)** — Core hospital patient flow events tracked in the EMR
- **CDSS (Clinical Decision Support System)** — Software alerts and prompts embedded in the EHR

### Metrics
- **HCAHPS** — Standardised patient satisfaction survey; scores tied to CMS reimbursement
- **LOS (Length of Stay)** — Number of days a patient is hospitalised; key efficiency metric
- **Readmission Rate** — Percentage of patients returning within 30 days; CMS penalises high rates
- **CMI (Case Mix Index)** — Average complexity/acuity of patients; higher = more resource-intensive
`,
  },
  {
    sector: "Manufacturing",
    guide_content: `## Manufacturing Industry Terminology

### Roles & Organisational Structure
- **Floor Worker / Operator** — Frontline production employee working on the line or with machines
- **Shift Lead / Supervisor** — First-level supervisor responsible for a crew during one shift
- **QA Inspector / Quality Technician** — Inspects products against specifications; accepts or rejects batches
- **Process Engineer** — Designs and optimises manufacturing processes; owns SOPs
- **Industrial Engineer (IE)** — Focuses on system efficiency, layout, time studies, and ergonomics
- **Maintenance Technician** — Repairs and preventively maintains equipment; crucial for uptime
- **Plant Manager** — P&L owner for a single facility; responsible for safety, quality, cost, and delivery
- **Production Planner / Scheduler** — Translates demand into production schedules and raw material orders
- **Materials Manager** — Oversees inventory, purchasing, and supply chain for the plant

### Lean & Continuous Improvement
- **Lean Manufacturing** — Toyota-derived philosophy of eliminating waste (muda) to maximise value
- **Six Sigma** — Data-driven methodology to reduce defects to 3.4 per million opportunities (DPMO)
- **Kaizen** — Japanese term for continuous small improvements; often structured as a week-long "kaizen event"
- **5S** — Sort, Set in order, Shine, Standardise, Sustain; workplace organisation methodology
- **PDCA (Plan-Do-Check-Act)** — Iterative problem-solving and improvement cycle
- **Value Stream Mapping (VSM)** — Visual tool mapping all steps in a process to identify waste
- **Gemba** — The actual place where work happens; "going to gemba" means observing the floor directly
- **Muda / Mura / Muri** — The three types of waste: pure waste, unevenness, and overburden

### Production Metrics
- **OEE (Overall Equipment Effectiveness)** — Availability × Performance × Quality; world-class = 85%+
- **Throughput** — Units produced per unit time; the primary output metric
- **Cycle Time** — Time from start to finish of one unit; reducing cycle time increases throughput
- **Takt Time** — Available production time divided by customer demand; sets the pace of the line
- **WIP (Work in Progress)** — Partially completed units or subassemblies between process steps
- **FPY (First Pass Yield)** — Percentage of units completing a process without defects or rework
- **DPMO (Defects Per Million Opportunities)** — Six Sigma quality metric
- **MTBF (Mean Time Between Failures)** — Average operating time between equipment breakdowns
- **MTTR (Mean Time To Repair)** — Average time to restore a broken machine to service
- **Scrap Rate** — Percentage of output discarded as non-conforming; directly impacts material cost

### Quality & Compliance
- **SOP (Standard Operating Procedure)** — Documented step-by-step instructions for a task
- **SPC (Statistical Process Control)** — Use of control charts to monitor process stability
- **Control Chart** — Graph plotting process data over time with control limits to detect variation
- **FMEA (Failure Mode and Effects Analysis)** — Risk assessment tool identifying potential failure points
- **CAPA (Corrective and Preventive Action)** — Formal process for resolving quality issues and preventing recurrence
- **ISO 9001** — International quality management standard; required by many OEM customers
- **AS9100 / IATF 16949** — Quality standards for aerospace and automotive manufacturing respectively
- **BOM (Bill of Materials)** — Structured list of all components required to build a product
- **ECO (Engineering Change Order)** — Formal process to revise a design or BOM
`,
  },
  {
    sector: "Retail",
    guide_content: `## Retail Industry Terminology

### Roles
- **Floor Associate / Sales Associate** — Frontline customer-facing employee working the sales floor
- **Key Holder** — Hourly associate with store-opening/closing authority and limited managerial responsibility
- **Department Manager** — Owns a specific product area; manages floor associates and drives department sales
- **Store Manager (SM)** — P&L owner for the store; responsible for sales, staffing, and operations
- **District Manager (DM)** — Oversees 8–15 stores in a geographic area
- **Merchandiser / Visual Merchandiser** — Sets product displays, follows planograms, and manages in-store aesthetics
- **Buyer** — Sourcing and selection role at HQ; negotiates with vendors and selects product assortments
- **Planner** — Partners with buyer to forecast demand and manage inventory allocation
- **Loss Prevention (LP) / Asset Protection (AP)** — Detects and prevents shrinkage from theft and fraud

### Inventory & Merchandising
- **SKU (Stock Keeping Unit)** — Unique identifier for a specific product variant (size, colour, etc.)
- **Planogram (POG)** — Schematic diagram specifying exactly how products should be positioned on shelves
- **Assortment** — The range of products carried by a store or category; breadth = number of SKUs
- **Modular / Reset** — Physical rearrangement of a department to a new planogram
- **Gondola** — Freestanding double-sided retail shelving unit
- **End Cap** — High-traffic display at the end of a shelf run; prime promotional real estate
- **Shrinkage / Shrink** — Inventory loss from theft, damage, or admin error; measured as % of sales
- **OOS (Out of Stock)** — A SKU with zero on-hand inventory; drives lost sales
- **Safety Stock** — Buffer inventory held to prevent OOS during demand spikes or supply delays
- **Markdown** — Price reduction, either permanent or promotional
- **COGS (Cost of Goods Sold)** — Direct cost of merchandise sold; gross margin = sales minus COGS

### Store Operations & Metrics
- **POS (Point of Sale)** — Checkout terminal where transactions are processed
- **Footfall / Traffic** — Number of customers entering the store; measured by door counters
- **Conversion Rate** — Percentage of visitors who make a purchase
- **ATV (Average Transaction Value)** — Average spend per transaction; also called AOV (Average Order Value)
- **UPT (Units Per Transaction)** — Average number of items per customer purchase
- **Comp Sales / Same-Store Sales (SSS)** — Revenue growth vs. the same period last year; excludes new stores
- **SPH (Sales Per Hour)** — Labour productivity metric: total sales ÷ labour hours
- **GMROI (Gross Margin Return on Investment)** — Gross margin generated per dollar of inventory; measures inventory productivity
- **Shrink %** — Shrinkage as a percentage of net sales; benchmark varies by category (apparel ~2%, grocery ~1%)
- **Planogram Compliance** — Percentage of SKUs correctly positioned per the POG; audited regularly

### Supply Chain & Omnichannel
- **DC (Distribution Centre)** — Warehouse that receives vendor shipments and picks/packs for stores or direct-to-consumer
- **Cross-Docking** — Transferring inbound vendor freight directly to outbound store shipments without warehousing
- **BOPIS (Buy Online, Pick up In Store)** — Omnichannel fulfilment model; also called click-and-collect
- **Ship-from-Store (SFS)** — Using store inventory to fulfil online orders; improves DC capacity
- **Replenishment** — Restocking shelves from backroom or DC; often automated based on POS triggers
`,
  },
  {
    sector: "Media",
    guide_content: `## Media Industry Terminology

### Roles (News & Journalism)
- **Editor** — Oversees content quality, assigns stories, and has final say on publication
- **Managing Editor (ME)** — Day-to-day operations leader; coordinates between sections and production
- **Executive Editor / Editor-in-Chief** — Top editorial authority; sets editorial policy and tone
- **Reporter / Correspondent** — Writes original stories; may be beat-specific or general assignment
- **Stringer** — Freelance contributor paid per story; no staff employment
- **Producer** — In broadcast/digital, manages story packaging, video, and logistics
- **Copy Editor** — Reviews and edits for grammar, style, accuracy, and legal risk
- **Photo Editor** — Selects, edits, and licenses images; coordinates with photographers
- **Anchor** — On-camera presenter who reads and contextualises news
- **Assignment Desk** — Central news coordination hub that tracks breaking stories and dispatches reporters

### Editorial Concepts
- **Beat** — A specific topic area a reporter covers regularly (e.g., tech, courts, City Hall)
- **Byline** — Author credit printed with a story
- **Masthead** — Publication's official staff listing; also refers to the name/logo at the top of the front page
- **Dateline** — Location and date at the start of a story filed away from the main office
- **Lede / Lead** — Opening sentence or paragraph; "burying the lede" means hiding the key news lower down
- **Inverted Pyramid** — Story structure putting the most important facts first, detail and context later
- **Embargo** — Agreement to hold a story until a specified release time
- **Source / Tipster** — Person providing information; may be on or off the record
- **Off the Record** — Information provided that cannot be published or attributed
- **Background / On Background** — Can be used in reporting but not attributed by name
- **Syndication** — Licensing content to run in other publications; a key revenue and reach mechanism

### Advertising & Business
- **CPM (Cost Per Mille)** — Cost per 1,000 ad impressions; fundamental digital advertising unit
- **CPC (Cost Per Click)** — Advertiser pays per click rather than per impression
- **CTR (Click-Through Rate)** — Percentage of ad impressions that result in a click
- **Programmatic** — Automated, auction-based buying and selling of digital ad inventory in real time
- **Ad Server** — Technology platform that delivers and tracks ads across publishers
- **Paywall** — Subscription gate restricting access to premium content
- **RPM (Revenue Per Mille)** — Publisher revenue per 1,000 page views or impressions
- **Churn** — Subscriber cancellation rate; the primary threat to subscription-model publishers
- **Audience Development** — Strategy and tactics to grow readership/viewership and reduce churn

### Broadcast & Production
- **B-Roll** — Supplementary footage used to illustrate a story; cutaways from the main interview/anchor
- **Chyron / Lower Third** — On-screen text graphic identifying a speaker or providing context
- **Package** — Pre-produced broadcast story with reporter narration, interviews, and b-roll
- **Live Shot / Live Hit** — Reporter broadcasting live from a location
- **Rundown** — Ordered list of segments for a broadcast show
- **Sweeps** — Audience measurement periods (historically Feb, May, July, Nov); drive programming decisions
`,
  },
  {
    sector: "Legal",
    guide_content: `## Legal Industry Terminology

### Roles & Hierarchy (Law Firms)
- **Summer Associate** — Law student (2L/3L) interning at a firm; effectively a paid tryout for a full-time offer
- **Associate** — Salaried attorney, typically 0–8 years post-graduation; does most of the substantive work
- **Senior Associate** — 5–8 year associate approaching partnership decision; leads matters and supervises junior associates
- **Of Counsel** — Experienced attorney affiliated with the firm but not on the partner track; often a former partner or lateral hire with a specific practice
- **Non-Equity Partner** — Admitted to partnership title but receives salary rather than profit share; sometimes called "income partner"
- **Equity Partner** — Full partner owning a share of the firm's profits; the pinnacle of the law firm career ladder
- **Managing Partner** — Leads firm management and strategy; equivalent to a CEO
- **Paralegal / Legal Assistant** — Non-attorney professional who supports lawyers with research, drafting, and case management
- **Solicitor (UK)** — Qualified lawyer who advises clients, drafts documents, and may appear in lower courts; primary client contact
- **Barrister (UK)** — Advocate specialising in courtroom argument; typically instructed by solicitors, not directly by clients
- **In-House Counsel / GC (General Counsel)** — Corporate attorneys employed directly by a company rather than a law firm

### Billing & Economics
- **Billable Hour** — The fundamental unit of law firm revenue; work billed to clients in six-minute increments
- **Billable Target** — Annual target hours (typically 1,800–2,200 for BigLaw associates)
- **Realization Rate** — Percentage of billed time actually collected from clients
- **Leverage** — Ratio of associates to partners; higher leverage = more associate revenue per partner
- **Lockstep Compensation** — Salary scale tied to year of admission, not individual performance; common in AmLaw 100 firms

### Litigation
- **Complaint** — Initial pleading filed by the plaintiff initiating a lawsuit
- **Answer** — Defendant's formal response to the complaint
- **Motion to Dismiss** — Pre-answer or early motion arguing the case should be thrown out on legal grounds
- **Summary Judgment** — Motion arguing no genuine factual dispute exists, entitling movant to judgment as a matter of law
- **Discovery** — Pre-trial phase where parties exchange information; includes documents, interrogatories, and depositions
- **Deposition** — Out-of-court sworn testimony taken before trial; produces a transcript and is used to lock in facts
- **Interrogatories** — Written questions a party must answer under oath during discovery
- **Brief** — Written legal argument submitted to a court (merits brief, amicus brief, reply brief)
- **Pleading** — Formal document filed with the court stating a party's position
- **Injunction / TRO (Temporary Restraining Order)** — Court order requiring or prohibiting specific conduct
- **Motion in Limine** — Pre-trial motion to exclude certain evidence from trial

### Transactional / Corporate
- **Due Diligence** — Systematic review of a target company's legal, financial, and operational records before a transaction
- **Closing** — The final step in a deal where documents are signed and consideration is exchanged
- **Representations and Warranties (Reps & Warranties)** — Factual statements in a contract that the parties certify as true
- **Indemnification** — Contractual obligation of one party to compensate another for specified losses
- **Material Adverse Change (MAC)** — Clause allowing a buyer to walk away if the target suffers a significant negative change before closing
- **Redline** — Marked-up version of a document showing proposed changes; "exchanging redlines" is standard deal negotiation
- **Escrow** — Funds or documents held by a neutral third party pending fulfilment of conditions
- **NDA (Non-Disclosure Agreement)** — Contract restricting disclosure of confidential information; often the first document signed in a deal
`,
  },
  {
    sector: "Education",
    guide_content: `## Education Industry Terminology

### Roles & Tracks (Higher Education)
- **Adjunct / Adjunct Instructor** — Part-time, contract faculty paid per course; no job security or benefits; backbone of many universities
- **Lecturer / Senior Lecturer** — Full-time teaching-focused non-tenure-track faculty; UK equivalent of assistant/associate professor
- **Visiting Professor** — Temporary appointment, often while on leave from another institution
- **Assistant Professor** — Entry-level tenure-track faculty; typically has 5–7 years to achieve tenure
- **Associate Professor** — Tenured or tenure-track; mid-career rank achieved upon receiving tenure
- **Full Professor** — Highest standard academic rank; achieved through further research and service after associate
- **Endowed / Named Professor** — Chair funded by a donation; carries prestige and supplemental funding
- **TA (Teaching Assistant)** — Graduate student assisting with a course; may lead sections, grade, and hold office hours
- **RA (Research Assistant)** — Graduate student funded to support faculty research
- **Postdoc (Postdoctoral Researcher)** — Temporary research position after PhD; bridge between graduate school and faculty job
- **Dean** — Administrative head of a college or school within a university
- **Provost** — Chief academic officer of a university; second to the President/Chancellor

### Academic Processes
- **Tenure** — Permanent employment status awarded after a review process; provides academic freedom and job security
- **Tenure Review / Tenure Case** — Portfolio of research, teaching, and service evaluated by internal and external reviewers
- **Sabbatical** — Paid leave (typically one semester or year every 6–7 years) for research and writing
- **Curriculum** — The structured plan of courses and learning objectives for a programme
- **Pedagogy** — Theory and practice of teaching; encompasses instructional methods and educational philosophy
- **Syllabus** — Course outline specifying objectives, assignments, policies, and reading schedule
- **IRB (Institutional Review Board)** — Committee that reviews and approves research involving human subjects
- **IRB Protocol** — Formal application describing a human-subjects study for ethical review
- **Dissertation / Thesis** — Major research document required for a doctorate (dissertation) or master's (thesis)
- **Defence** — Oral examination where a student presents and defends their dissertation/thesis to a committee
- **Qualifying Exam / Comps** — Comprehensive examination (written, oral, or both) that PhD students must pass before candidacy

### K-12 Education
- **IEP (Individualised Education Plan)** — Legal document specifying accommodations and goals for a student with a disability
- **504 Plan** — Accommodation plan for students with disabilities not requiring special education services
- **Differentiated Instruction** — Adapting teaching methods and materials to meet diverse learner needs
- **Common Core** — K–12 standards in maths and ELA adopted by most US states
- **MTSS (Multi-Tiered System of Supports)** — Framework for providing targeted academic and behavioural support

### Accreditation & Quality
- **Accreditation** — Formal recognition by an external body that an institution or programme meets quality standards
- **SACSCOC, HLC, WASC** — The major US regional accreditors for higher education
- **NCATE / CAEP** — Accreditors for teacher preparation programmes
- **Learning Outcomes** — Specific, measurable skills or knowledge students should demonstrate upon completion
- **Assessment** — Systematic collection of evidence about student learning against defined outcomes
- **FAFSA** — Federal financial aid application; completion rate used as an equity metric
`,
  },
  {
    sector: "Transportation",
    guide_content: `## Transportation Industry Terminology

### Roles
- **Dispatcher** — Controls and coordinates vehicle movements; assigns loads, monitors progress, handles issues in real time
- **Fleet Manager** — Oversees the maintenance, utilisation, and compliance of a vehicle fleet
- **Driver / Operator** — Operates vehicles; CDL required for commercial vehicles above certain weight thresholds
- **CDL (Commercial Driver's Licence)** — Federal licence required to operate commercial vehicles > 26,001 lbs GVWR or hazmat/passenger vehicles
- **Owner-Operator (O/O)** — Independent contractor who owns and drives their own truck; may lease onto a carrier
- **Load Planner** — Designs efficient load configurations to maximise payload and minimise damage
- **Terminal Manager** — Oversees operations at a specific freight or transit hub
- **Logistics Coordinator** — Manages the end-to-end movement of goods, including carrier selection and tracking
- **Freight Broker** — Intermediary matching shippers with carriers; earns a margin on the rate differential

### Trucking & Freight
- **LTL (Less Than Truckload)** — Shipments that don't fill a full trailer; consolidated with other shippers' freight
- **FTL / TL (Full Truckload)** — A single shipper fills the entire trailer
- **Drayage** — Short-distance movement of containers, typically from port to nearby warehouse or rail ramp
- **Intermodal** — Use of multiple modes (ship, rail, truck) in a single journey, usually via standardised containers
- **Deadheading** — Driving with an empty trailer to a new pickup location; pure cost with no revenue
- **Bobtail** — Tractor operating without a trailer attached
- **Drop and Hook** — Driver drops a loaded trailer and picks up a pre-loaded one; eliminates live-loading wait time
- **Live Load/Unload** — Driver waits while the trailer is loaded or unloaded
- **Detention** — Penalty charged to shipper when driver waits beyond the free-time window at a dock

### Metrics & Performance
- **Dwell Time** — Time a vehicle or container spends at a terminal, port, or customer facility without moving
- **Last Mile** — Final leg of delivery from a hub to the end customer; most expensive and complex segment
- **OTP (On-Time Performance)** — Percentage of deliveries or trips completed within scheduled window; KPI for all modes
- **Load Factor / Utilisation** — Percentage of available capacity (weight, volume, seats) actually used
- **Miles Per Gallon (MPG) / Fuel Efficiency** — Key cost driver; monitored at fleet and individual vehicle level
- **GVWR (Gross Vehicle Weight Rating)** — Maximum operating weight of a vehicle as specified by the manufacturer
- **HOS (Hours of Service)** — FMCSA rules limiting commercial driver working and driving hours to prevent fatigue
- **ELD (Electronic Logging Device)** — Mandated device recording driver HOS data; replaced paper logs
- **CSA Score (Compliance, Safety, Accountability)** — FMCSA scoring system for carrier safety performance
- **Freight Rate / Spot Rate** — Price per mile or per load; spot rates fluctuate with market supply/demand

### Transit & Public Transport
- **Headway** — Time interval between successive vehicles on the same route; lower = more frequent service
- **OTP (On-Time Performance)** — In transit: percentage of trips departing/arriving within a tolerance (e.g., ±5 min)
- **Farebox Recovery** — Proportion of operating costs covered by passenger fares; most systems recover 20–50%
- **GTFS (General Transit Feed Specification)** — Standardised data format for transit schedules; powers Google Maps and trip planners
- **Interline Agreement** — Agreement allowing passengers to transfer between different transit operators on a single fare
`,
  },
];

// ── Upsert function ───────────────────────────────────────────────────────────

async function upsertGuides() {
  const endpoint = `${SUPABASE_URL}/rest/v1/terminology_guides?on_conflict=sector`;
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  console.log(`Upserting ${guides.length} terminology guides to ${SUPABASE_URL}...\n`);

  for (const guide of guides) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sector: guide.sector,
        guide_content: guide.guide_content,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ ${guide.sector}: HTTP ${res.status} — ${body}`);
    } else {
      console.log(`  ✓ ${guide.sector}`);
    }
  }

  console.log("\nDone.");
}

upsertGuides().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
