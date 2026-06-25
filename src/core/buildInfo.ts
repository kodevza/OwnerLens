declare const __OWNERLENS_VERSION__: string | undefined;

export const ownerLensVersion =
  typeof __OWNERLENS_VERSION__ === "string" && __OWNERLENS_VERSION__.trim()
    ? __OWNERLENS_VERSION__
    : "dev";
