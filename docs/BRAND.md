# ANQ visual conventions

This project belongs to the ANQ family and owns its own palette and layout.
Its theme lives in `src/client/tokens.css`. Keep semantic colour roles, font roles,
spacing scale and control radii consistent with the other ANQ projects.
Typography uses a familiar sans-serif body and editorial serif where appropriate.
The ANQ favicon uses this project's own brand colour.

Change palette values locally; do not copy another project's layout wholesale.
Preserve contrast, visible keyboard focus, readable errors and labelled status.
Colour must not be the only state indication. Page/component rules stay in their
existing stylesheets. No remote stylesheet or shared runtime UI package is needed.

Use the repository's local build and relevant browser/accessibility checks after
visual changes. Screenshot data must remain fictional. Deployment is a separate
step from local branding work.
