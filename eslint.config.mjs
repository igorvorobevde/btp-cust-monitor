// CDS model lint (`npm run lint:cds` → `cds lint`): recommended rules of @sap/eslint-plugin-cds for the CDS files
// in db/, srv/ and app/*/annotations.cds. The Fiori app's JavaScript has its own ESLint config (app/monitor/eslint.config.mjs,
// run via `npm run lint --workspace app/monitor`); generator scripts under docs/ and build output are not linted.
import cdsPlugin from "@sap/eslint-plugin-cds";

export default [
	{
		ignores: ["app/*/webapp/**", "app/*/dist/**", "docs/**", "gen/**", "coverage/**", "mta_archives/**", "jowat-webshop-registration-main/**"]
	},
	cdsPlugin.configs.recommended
];
