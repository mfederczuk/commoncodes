import Exception from "@mfederczuk/custom-exception";
import chalk from "chalk";
import { readdirSync, readFileSync, realpathSync } from "fs";
import * as jsyaml from "js-yaml";
import parsePerson from "parse-author";
import { SemVer } from "semver";
import * as typesafeArray from "typesafe-array";
import CommonCodesData from "./CommonCodesData";
import { parseDescription } from "./description";
import { ExitStatusTable } from "./exitStatus";
import { SeeAlsoLink } from "./seeAlsoLink";
import { StatusMessageSyntaxError } from "./statusMessage";

const GENERATED_DATE = new Date();

const ROOT_DIR = realpathSync(__dirname + "/..");
const RAW_DIR = realpathSync(ROOT_DIR + "/raw");

const METADATA_FILENAME = "metadata.yaml";
const NAME_FILENAME = "name.desc";
const DESCRIPTION_FILENAME = "description.desc";
const EXIT_STATUS_TABLE_FILENAME = "exit_status_table";
const FOOTNOTES_FILENAME = "footnotes.desc";
const SEE_ALSO_FILENAME = "see_also.yaml";

const majorVersions = ((): number[] => {
	const entries = readdirSync(RAW_DIR);

	const majorVersions: number[] = [];

	entries.forEach((entry) => {
		const match = entry.match(/^v([1-9][0-9]*)$/);
		if(match !== null) majorVersions.push(Number(match[1]));
	});

	return majorVersions.sort();
})();

try {
	const dataSet = majorVersions.map((majorVersion): CommonCodesData => {
		const versionDir = `${RAW_DIR}/v${majorVersion}`;

		const metadataFileContents = readFileSync(`${versionDir}/${METADATA_FILENAME}`).toString();
		const metadata = jsyaml.safeLoad(metadataFileContents) as {
			readonly authors?: unknown;

			// eslint-disable-next-line camelcase
			readonly copyright_years?: unknown;
			// eslint-disable-next-line camelcase
			readonly copyright_holder?: unknown;

			// eslint-disable-next-line camelcase
			readonly release_version?: unknown;
			// eslint-disable-next-line camelcase
			readonly release_date?: unknown;
		};

		if(!typesafeArray.string[1](metadata.authors) ||
		   !typesafeArray.number[1](metadata.copyright_years) ||
		   typeof(metadata.copyright_holder) !== "string" ||
		   typeof(metadata.release_version) !== "string" ||
		   !(metadata.release_date instanceof Date)) {

			throw new Exception(`Invalid ${METADATA_FILENAME} file`);
		}

		const nameFileContents = readFileSync(`${versionDir}/${NAME_FILENAME}`).toString();
		const name = parseDescription(nameFileContents);

		const descriptionFileContents = readFileSync(`${versionDir}/${DESCRIPTION_FILENAME}`).toString();
		const description = parseDescription(descriptionFileContents);

		const exitStatusTableFileContents = readFileSync(`${versionDir}/${EXIT_STATUS_TABLE_FILENAME}`).toString();
		const exitStatusTable = ExitStatusTable.parse(exitStatusTableFileContents);

		const footnotesFileContents = readFileSync(`${versionDir}/${FOOTNOTES_FILENAME}`).toString();
		const footnotes = parseDescription(footnotesFileContents);

		const seeAlsoFileContents = readFileSync(`${versionDir}/${SEE_ALSO_FILENAME}`).toString();
		const seeAlso = jsyaml.safeLoad(seeAlsoFileContents) as {
			readonly links?: unknown;
			readonly mansite?: unknown;
		};

		if(!typesafeArray.string[1](seeAlso.links) ||
		   typeof(seeAlso.mansite) !== "string") {

			throw new Exception(`Invalid ${SEE_ALSO_FILENAME} file`);
		}

		return {
			metadata: {
				authors: metadata.authors.map(parsePerson),

				copyrightYears: metadata.copyright_years,
				copyrightHolder: parsePerson(metadata.copyright_holder),

				releaseVersion: new SemVer(metadata.release_version),
				releaseDate: metadata.release_date
			},

			name: name,
			description: description,
			exitStatusTable: exitStatusTable,
			footnotes: footnotes,
			seeAlso: {
				links: seeAlso.links.map(SeeAlsoLink.from).filter((seeAlsoLink) => {
					return seeAlsoLink !== null;
				}) as SeeAlsoLink[],
				mansite: seeAlso.mansite
			}
		};
	});
} catch(err) {
	if(err instanceof StatusMessageSyntaxError) {
		const errorColor = chalk.red.bold;

		let msg = "";

		msg += errorColor("error:");
		msg += " " + err.problem.getMessage();

		msg += "\n";

		msg += "\t";
		msg += err.faultyStatusMessage.substring(0, err.rangeStart);
		msg += errorColor(err.faultyStatusMessage.substr(err.rangeStart, err.rangeLength));
		msg += err.faultyStatusMessage.substring(err.rangeStart + err.rangeLength);

		msg += "\n";

		msg += "\t";
		msg += " ".repeat(err.rangeStart);
		msg += errorColor("^" + "~".repeat(err.rangeLength - 1));

		console.error(msg);
		process.exitCode = 1;
	} else {
		throw err;
	}
}
