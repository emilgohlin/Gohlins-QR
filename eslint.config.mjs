// eslint-config-next 16 ÄR en flat config och ska spridas rakt in här.
// Den tidigare FlatCompat-omvägen är kvar från äldre versioner och kraschar mot
// den nya formen ("Converting circular structure to JSON") – lint gick alltså
// inte att köra alls.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
