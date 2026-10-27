// UI5 build task (O-02): in the HTML5 repository the app runs under the managed approuter / Work Zone with a
// path prefix, so the OData service must be addressed relative to the app (xs-app.json routes ^odata/ → srv-api).
// Locally (cds watch, cds-plugin-ui5 under /monitor) the absolute /odata/v4/monitor/ stays in the source manifest.
"use strict";

module.exports = async function ({ workspace }) {
	const resources = await workspace.byGlob("**/manifest.json");
	for (const resource of resources) {
		const manifest = JSON.parse(await resource.getString());
		const dataSources = (manifest["sap.app"] && manifest["sap.app"].dataSources) || {};
		for (const dataSource of Object.values(dataSources)) {
			if (typeof dataSource.uri === "string" && dataSource.uri.startsWith("/odata/")) {
				dataSource.uri = dataSource.uri.slice(1);
			}
		}
		resource.setString(JSON.stringify(manifest, null, "\t"));
		await workspace.write(resource);
	}
};
