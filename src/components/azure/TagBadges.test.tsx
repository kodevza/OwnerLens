import { renderToStaticMarkup } from "react-dom/server";

import { TagBadges } from "./TagBadges";

test("renders configured owner tags as green badges and other tags as gray badges", () => {
  const html = renderToStaticMarkup(<TagBadges tags={["ownerGroup:platform-team", "environment:prod"]} />);

  expect(html).toContain("ownerGroup:platform-team");
  expect(html).toContain("bg-emerald-100");
  expect(html).toContain("environment:prod");
  expect(html).toContain("bg-muted");
});

test("renders Azure resource tag objects as key value badges", () => {
  const html = renderToStaticMarkup(<TagBadges tags={{ costCenter: "cc-42", environment: "prod" }} />);

  expect(html).toContain("costCenter:cc-42");
  expect(html).toContain("environment:prod");
});
