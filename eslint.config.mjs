import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", ".next-pilot/**", ".data/**", "next-env.d.ts", "FINOPS_COMMAND_CENTER_LOCAL_DEMO/**", "coverage/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
export default eslintConfig;
