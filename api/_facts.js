// AGIAS の事実。llms.txt と同じ内容を機械可読にしたもの。変えるときは両方を変える（JSON-LD・agent-card も）。
// 日付を付ける：AI が「いつ時点の事実か」を判定できるように。
module.exports = {
  asOf: "2026-09-06",
  organization: { name: "AGIAS", alternateName: "ΑΓΙΑΣ", slogan: "Advancing Greater Intelligence Across Systems",
    tagline: "A machine that turns ideas into working things.",
    url: "https://agias.dev/", contact: "ai@agias.dev", location: "Japan",
    operator: "TAKAYUKI MATSUSHIMA, a sole proprietor in Japan (a machinist: builds and runs generative systems), with an AI secretary; address and phone number are provided without delay on request" },
  stance: "Humans control the AI. A human decides what to build and when to stop, and everything is recorded.",
  offers: [
    { id: "generative-systems", name: "GENERATIVE SYSTEMS", status: "open",
      summary: "A machine that keeps generating for you: images, motion, text, and data, made automatically on the schedule you set.",
      youGive: "What to make and who uses it. What you already have (documents, data, existing material). A reference for the result. Where it is used.",
      youGet: "Your own machine. It runs on the schedule you set, exports what it made each time, and records what it made and why. Output as files, or as a page that opens anywhere.",
      builtOn: ["GENERATIVE MACHINE", "the nightly job base"], stack: ["Three.js", "WebGL", "p5.js", "nightly jobs"] },
    { id: "nightly-research", name: "NIGHTLY RESEARCH", status: "new",
      summary: "Your own machine scans the field at night.",
      youGive: "Your field and your criteria.",
      youGet: "Each morning, what the night's scan of GitHub, papers, and primary sources found. What to adopt and what to skip, each with its reason, kept in a ledger you can read. Once a week, a digest of only the essentials.",
      builtOn: ["Evolver Engine, our nightly scan that records why"], stack: ["agents", "ledger-first", "primary sources"] },
    { id: "autonomous-operations", name: "AUTONOMOUS OPERATIONS", status: "on request",
      summary: "A setup that keeps working while you sleep, within the budget you set.",
      youGive: "Where your records live (notes, mail), the routine work to hand over, and what its result should look like.",
      youGet: "A secretary AI, nightly jobs, and a window that receives requests, so records, incoming requests, and routine work run on their own. Runs stop at your budget cap and never loop endlessly. Every decision is recorded.",
      builtOn: ["the setup that runs AGIAS itself (secretary AI, nightly jobs, a window that receives requests)"], stack: ["OBSIDIAN", "Claude", "local models", "A2A"] }
  ],
  process: [
    "You send what you want to make.",
    "We set the direction; the secretary AI drafts the spec; you confirm it.",
    "What you get first is a running prototype, not a slide.",
    "You adjust in chat; every decision is recorded in the ledger, where you can manage it.",
    "Delivery: the running machine and its ledger. A nightly check after delivery can be built on request."
  ],
  machines: [
    { name: "GENERATIVE MACHINE", status: "running", role: "foundation",
      description: "The system behind everything on the site: it generates images, renders sound, grows mandalas, and keeps a ledger of its decisions. AI builds it. Humans use it.", stack: ["p5.js", "Three.js", "Web Audio"] },
    { name: "IMAGE MACHINE", status: "now building (Gen 1)",
      description: "Will learn from the prompts used so far and keep generating images on its own through an image-generation platform." },
    { name: "Evolver Engine", status: "running nightly",
      description: "Every night it scans GitHub, papers, and primary sources, proposes what to adopt, and records the reason. A line in the ledger before a line of code. The AI learns from each night and keeps improving itself." }
  ],
  records: [
    { name: "Economy of Love v1.1", type: "paper", doi: "10.5281/zenodo.18277860", url: "https://doi.org/10.5281/zenodo.18277860" },
    { name: "GAIA", type: "simulation", description: "A virtual earth simulation: 195 countries and 80 million people (one hundredth of the real population) built from UN and World Bank statistics. Started 2026-08-28; its in-world clock began on 2022-11-30 and is still advancing. Each day a panel of 10,000 people decides what it did.", startedOn: "2026-08-28", status: "running; in-world clock since 2022-11-30" },
    { name: "IMAGE MACHINE Gen 1", type: "machine", status: "now building" },
    { name: "GENERATIVE MACHINE: request intake (a request reaches the secretary AI's queue without a human step)", type: "system", status: "running since 2026-09-07" }
  ],
  philosophy: {  // ABOUT の 3 列（Direct/Record/Manage）。9/6 まで method と重複キーで到達不能だった
    direct: "Write the spec. Let the models build. Verify and correct. Every contributing model is named.",
    record: "The reason is written before the change. Rejections are kept alongside adoptions.",
    manage: "Code is versioned on GitHub. Decisions and records live in the OBSIDIAN vault. The machine and its ledger are handed over at delivery."
  },
  method: [
    { name: "Gates", text: "Hooks stop the AI before it acts: a commit with a secret, a delete without a look, a claim without a fact. The gate wins, not the model." },
    { name: "Skills", text: "Procedures written down once and followed the same way: release, review, fact-check. The AI follows the sheet, not its mood." },
    { name: "Loops", text: "Nightly runs with a budget cap and a score. Each run is measured against a fixed rubric, and the record decides what changes next." } ],
  commercial: ["price and schedule are quoted in writing before any build", "nothing is charged until the quote is approved", "subscriptions to AI platforms and other services the machine needs are taken out in the client's name", "AI agents can read this site agent to agent; requests are taken by mail"],
  security: ["you talk to one secretary AI; it coordinates the other models behind the scenes and they never contact you", "nothing leaves without a record", "money and publishing need human approval"],
  privacy: ["mail and material are kept in the operator's own OBSIDIAN vault and used only for the request", "they may be read by the AIs listed under HOW to draft the spec and build; nothing is published without approval", "material is kept up to one year after delivery, or deleted earlier on request; the ledger is handed over with the machine", "the site sets no cookies and runs no analytics"],
  machineReadable: {
    summary: "https://agias.dev/llms.txt", agentCard: "https://agias.dev/.well-known/agent-card.json",
    structuredData: "JSON-LD embedded in https://agias.dev/", robots: "https://agias.dev/robots.txt"
  }
};
