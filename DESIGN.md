# Visual conventions

Keep the portfolio family recognizable: project-specific colours, pale surfaces, quiet
borders, restrained typography and generous space. The social app uses an editorial
serif heading; forms and body copy use the same familiar sans-serif family as the
supporting apps. Its reading column is narrower than an operations dashboard.

`src/client/tokens.css` owns colours, fonts, spacing, radii and layout widths.
`style.css` owns components, layout and responsive rules. React components use
semantic classes, not inline colours or style objects. Change a token to adjust
the overall visual vocabulary; change a component rule for its behavior/layout.

Use descriptive roles such as `--color-surface`, `--color-brand` and
`--color-muted`, rather than naming a colour after its present shade. Preserve
contrast and visible keyboard focus when changing a theme. Use shared Composer
and PostCard components so feed, profiles and threads change together.

These are ordinary app-local CSS variables. No runtime theme engine, Tailwind
configuration or published component package is required. Future remakes should
start from the same token names, adapting page structure to their purpose.
Existing apps can adopt these names when their UI next changes; migrating all of
them now is not a prerequisite for shipping this app.

Avoid tuning individual pages with unrelated colour literals. If a new visual
role is actually needed, name it in the token file. The current look is a base
we can refine once the core workflows are complete.

Page views belong in `src/client/pages/`, shared controls in `components/`, and
the sidebar/topbar/reading area in `layouts/AppShell.tsx`. Keep route data loading
in `App.tsx`, plain-text rendering in React, and the existing three-post page size.
Primary navigation stays in the same order across sessions. Browser titles and
keyboard focus must identify the current view; opening sign-in focuses Username.
