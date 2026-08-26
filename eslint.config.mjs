import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "supabase/functions/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // `next/image` grava `style="color:transparent"` no elemento, e a CSP
      // desta aplicação não permite atributo `style` inline. As imagens aqui são
      // logos estáticas, ícones de tipo e QR gerado localmente: o otimizador não
      // traria ganho que justifique afrouxar a política.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
