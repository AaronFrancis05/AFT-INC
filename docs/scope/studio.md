# Epic: App Studio (idea to production app)

Back to the [scope index](index.md).

A Figma like studio where a customer brings an idea and gets a brief, wireframes, hi fi designs, generated code, and a deployed preview, editing together in real time. Broken into small features: the shared design format first, then the canvas, then collaboration, then each AI step, then code and deploy. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 9a: Design format and studio basics

### 99. Design format (Design IR) · needs a decision · GA
One versioned format for briefs, screens, components, and tokens. The canvas shows it, AI writes it, codegen reads it.
**Done when:** the format is a versioned, validated schema; invalid data is never saved (S5); older documents upgrade automatically on load with a test per upgrade (S6).
- [ ] Design it (spec): `/architect design format design ir`

### 100. Studio projects · needs a decision
Create, list, open, rename, and delete studio projects in a workspace.
**Done when:** studio projects belong to a workspace, respect roles, and open to an empty document.
- [ ] Design it (spec): `/architect studio projects`

### 101. Idea to brief · needs a decision
Turn a rough idea into a structured product brief.
**Done when:** the AI produces a brief (goals, users, pages, features) from the idea; vague input gets clarifying questions; hostile input is moderated; input and output work in the user's language (S8).
- [ ] Design it (spec): `/architect idea to brief`

### 102. Brief editor · needs a decision
Review and edit the brief before designing.
**Done when:** users edit every brief section, see versions, and the brief saves in the design format.
- [ ] Design it (spec): `/architect brief editor`

## Slice 9b: Canvas

### 103. Canvas core · needs a decision
The infinite canvas: frames, shapes, text, pan, and zoom.
**Done when:** users create and move frames, shapes, and text, pan and zoom smoothly on a large document, and everything saves in the design format.
- [ ] Design it (spec): `/architect canvas core`

### 104. Layers and properties · needs a decision
Select, group, order, and style anything on the canvas.
**Done when:** a layers panel and a properties panel edit size, position, color, type, and layout for the selection, with keyboard support.
- [ ] Design it (spec): `/architect layers and properties`

### 105. Component library · needs a decision
Drag in ready components that map to real code components.
**Done when:** users insert components from a library, each one maps to a code component in the design format, and edits stay within its allowed properties.
- [ ] Design it (spec): `/architect component library`

### 106. Per user undo · needs a decision
Undo and redo that only touch your own changes.
**Done when:** undo and redo reverse only the current user's changes, even while others edit (S14).
- [ ] Design it (spec): `/architect per user undo`

## Slice 9c: Live collaboration

### 107. Realtime sync · needs a decision
Several people edit the same document at once without losing work.
**Done when:** edits sync between clients in real time, survive a server restart with nothing lost (S3), and large documents are compacted with a size warning (S4).
- [ ] Design it (spec): `/architect realtime sync`

### 108. Presence and cursors · needs a decision
See who is here and where they are working.
**Done when:** avatars of active users, live cursors, and selections show for every collaborator, and leave when they disconnect.
- [ ] Design it (spec): `/architect presence and cursors`

### 109. Comments · needs a decision
Pin comments to the canvas and discuss.
**Done when:** users pin comments, reply, mention teammates, and resolve threads; mentions send notifications.
- [ ] Design it (spec): `/architect comments`

### 110. Offline edits and conflicts · needs a decision
Work offline and merge cleanly on return.
**Done when:** offline edits merge on reconnect with a snapshot taken first (S2), and when one user deletes what another is editing, the editor is told and undo restores it (S1).
- [ ] Design it (spec): `/architect offline edits and conflicts`

### 111. Collaboration permissions · needs a decision · GA
Who may view, comment, and edit, enforced on the server.
**Done when:** view, comment, and edit roles are enforced server side, and revoking access closes the user's live connection at once (A6, S15).
- [ ] Design it (spec): `/architect collaboration permissions`

## Slice 9d: AI design steps

### 112. Brief to wireframes · needs a decision
Generate wireframes for every page in the brief.
**Done when:** wireframes appear on the canvas as valid design format (S5), and regenerating offers a proposal to accept instead of overwriting manual edits (S7).
- [ ] Design it (spec): `/architect brief to wireframes`

### 113. Wireframes to hi fi design · needs a decision
Apply a design system to turn wireframes into polished screens.
**Done when:** users pick or define tokens, the AI produces hi fi screens from the wireframes, and changes arrive as an accept or reject proposal (S7).
- [ ] Design it (spec): `/architect wireframes to hi fi design`

## Slice 9e: Code and deploy

### 114. Code sandbox · needs a decision · GA
A locked down place to build and run generated code.
**Done when:** generated code runs isolated with CPU, memory, disk, process, and time limits and is killed and reported when it runs away (S11); dependencies come only from an allowlisted mirror, with no other network access, and secrets are scanned for (S10).
- [ ] Design it (spec): `/architect code sandbox`

### 115. Design to code · needs a decision
Generate a real Next.js app from the hi fi design.
**Done when:** the design becomes a typed Next.js project using the mapped components, and the code is visible in the studio.
- [ ] Design it (spec): `/architect design to code`

### 116. Build and fix loop · needs a decision
Generated code installs, compiles, and passes its tests, or the user sees why.
**Done when:** each generation runs install, typecheck, build, and tests in the sandbox; failures go through a limited number of automatic fixes; anything left is shown clearly (S9).
- [ ] Design it (spec): `/architect build and fix loop`

### 117. Preview deploys for generated apps · needs a decision
One click puts the generated app on a live preview URL.
**Done when:** a passing build deploys through the provisioning pipeline to a preview URL; previews respect quotas and expire after a set time (S12).
- [ ] Design it (spec): `/architect preview deploys for generated apps`

### 118. GitHub export · needs a decision
Push the generated app to the customer's own repository.
**Done when:** users connect GitHub and export to a new or existing repo; existing repos, missing permissions, revoked tokens, and protected branches each give a precise message, and nothing is ever force pushed (S13).
- [ ] Design it (spec): `/architect github export`
