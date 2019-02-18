#!/usr/bin/env node
/*
 * index.js
 *
 * The root file of the `tongoose` project
 *
 * Copyright (c) 2019 Kipras Melnikovas
 * MIT Licensed
 */

"use strict";
const fs = require("fs");
const path = require("path");
const yargs = require("yargs");
const chalk = require("chalk");
const prettier = require("prettier");

require("./utils/manageCliWithYargs")(yargs); // `yargs` will still contain everything (.argv, etc.)

// console.log("yargs.argv", yargs.argv); // #CLEANUP
const disableFormatting = yargs.argv["noFormat"] ? true : false;

const repository = "https://github.com/tongoose/tongoose";
const signature = `\
/**
 * Automatically generated by tongoose
 *
 * Check out the project at
 * ${repository}
 * 
 * Copyright (c) 2019 Kipras Melnikovas <kipras@kipras.org>
 * MIT Licensed
 */`;

const prettierOptions = { parser: "typescript" };

const formattingInfo = disableFormatting
	? `/** @tongoose: generated with --noFormat flag */`
	: `/** @tongoose: formatted using \`prettier\` with options ${JSON.stringify(
			prettierOptions
	  )} */`;

// NOTE - when updating the required imports and adding a new variable,
// make sure to also update the `convertCleanMongooseSchemaToTypeScriptReadyJSObject` function
// to return the proper type
// and Also edit the `doTheMagicMongooseSchemaIntoJSONObjectsAndTSTypeDefinitionFilesParsing` function
// to properly turn that type into a string using `.replace(regex)`;
const requiredImportsForTypeScriptInterfaces = `\
import { ObjectId, Decimal128 } from "bson"; // \`npm i --save-dev @types/mongodb\`\
`;

const collectAllModelFilesRecursivelySync = require("./utils/collectAllModelFilesRecursivelySync");
const convertCleanMongooseSchemaToTypeScriptReadyJSObject = require("./utils/convertCleanMongooseSchemaToTypeScriptReadyJSObject");
const makeSureAtLeastOneFileExistsOrExit = require("./utils/makeSureAtLeastOneFileExistsOrExit");
const generateRelativePathForTypeDefinitionOutputFile = require("./utils/generateRelativePathForTypeDefinitionOutputFile");

const toFilename = require("./utils/toFilename");
const toClickablePath = require("./utils/toClickablePath");

const relPathToModelsDirOrFile = require("./utils/returnModelDirOrFileOrShowHelpAndExit")();

const pathToDotTongooseDir = path.join("./", ".tongoose");
const pathToRawJSONOutputDir = path.join("./", ".tongoose", "json-raw");
const pathToCleanJSONOutputDir = path.join("./", ".tongoose", "json-clean");
const pathToTypeDefOutputDir = path.join("./", ".tongoose", "typedefs");

const directoriesToCreateInsideDotTongooseDir = [
	pathToDotTongooseDir,
	pathToRawJSONOutputDir,
	pathToCleanJSONOutputDir,
	pathToTypeDefOutputDir,
];

require("./utils/prepareDotTongooseDir")(
	pathToDotTongooseDir,
	directoriesToCreateInsideDotTongooseDir
);

let relFilePathArray = [...collectAllModelFilesRecursivelySync(relPathToModelsDirOrFile)];
const modelFileNameArray = relFilePathArray.map((filePath) => toFilename(filePath, false));

makeSureAtLeastOneFileExistsOrExit(relFilePathArray.length, relPathToModelsDirOrFile);

const relPathToIndexDDDTsFile = generateRelativePathForTypeDefinitionOutputFile(
	relPathToModelsDirOrFile,
	relFilePathArray
);

// don't forget your ';' before here! #DEBUG
(function doTheMagicMongooseSchemaIntoJSONObjectsAndTSTypeDefinitionFilesParsing() {
	let indexDDDTsFileStream = fs.createWriteStream(relPathToIndexDDDTsFile, {
		flags: "w",
	});

	indexDDDTsFileStream.write(`\
${signature}

${formattingInfo}

${requiredImportsForTypeScriptInterfaces}
`);

	for (const modelFile of relFilePathArray) {
		const fullFilePath = path.join("./", modelFile);
		const modelFileContent = fs.readFileSync(fullFilePath, { encoding: "utf-8" });

		// matches schema from start to end #IWillRefactorThisLATER
		// const schemaRegex = /(const|let|var).*?=.*?Schema\(.*(\r?\n.*?)*\}(\r?\n)*\)\;/g;
		const schemaRegex = /(const|let|var).*?=.*?Schema\([^]*?\}[\r\n\s]*\)\;/g;

		let rawSchemaContent = schemaRegex.exec(modelFileContent);

		if ((rawSchemaContent && rawSchemaContent.length > 0) || typeof rawSchemaContent === "array") {
			rawSchemaContent = rawSchemaContent[0];
		} else {
			// schema definition not found
			console.log(`\
${chalk.yellowBright(`Warning`)}: \
${chalk.white(`Schema definition not found in`)} \
\`${chalk.yellowBright(`${modelFile}`)}\` \
`);
			continue;
		}

		// please get familiar with:
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp
		// especially
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp#assertions

		// clean up & prepare schema content for parsing / importing #IWillRefactorThisLATER
		let schemaContentPreparedForImportingAndJSON = rawSchemaContent
			// .replace(/\/\/.*$/, "") // doesn't work
			.replace(/(const|let|var).*?=.*?Schema.*\(/, "module.exports = ") // first line of schema def
			.replace(/\<[^]*?\>/g, "") // typescript defs like <InterfaceName>
			// .replace(/},\r?\n?\s*{.*(\r?\n?.*?)*}\r?\n?\s*\)/, "}") // schema options

			// .replace(/(?<=}[\w\W]*?,){[\w\W]*?}[\w\W]*?\)/g, "}")
			.replace(/(?<=}[^]*?),[\n\r\s]*?{[^]*?}[^]*?(?=\))/g, "") // { + schema options + }) => )
			// .replace(/;/g, "")
			// /(?={[\w\W]*?}[\w\W]*?,){[\w\W]*?}[\w\W]*?\)/; overkill

			.replace(/}[\n\r\s]*?\);?/g, "}") // last line(s) from `})` => `}`

			// // .replace(/enum:\s*([^\[\],\s]*?)\s*},/, 'enum: "[$1]" }, ') // enum: someExternalVariable
			// // .replace(/enum:\s*([^\[}]*?),/g, 'enum: "[$1]", ')
			// // .replace(/default:\s*\n*\{\s*\n*\},?/g, "") // empty default
			// // .replace(/default:([^\}]\n?)*?,/g, "") // default **with** something else after it
			// // .replace(/default:([^,]\n?)*?}[^,]+?/g, "}") // default **without** anything else after it

			// arrays:
			// .replace(/Date\.([^\s]+)\([^]*\)/g, '"Date.$1()"') // `Date.someMethodOrFunction(fooBar)`
			// .replace(/(\[)?Date(\])?(?!\.now\(\))/g, '"$1date$2"'); // `Date` or `[Date]`, not followed by .now()
			// .replace(/(\[)?ObjectId(\])?/g, '"$1ObjectId$2"') // `ObjectId` or `[ObjectId]` (replaced to string)
			// .replace(/(\[)?Boolean(\])?/g, '"$1boolean$2"') // `Boolean` or `[Boolean]`
			// .replace(/(\[)?Number(\])?/g, '"$1number$2"') // `Number` or `[Number]`
			// .replace(/(\[)?String(\])?/g, '"$1string$2"') // `String` or `[String]`

			// ts arrays:

			// `Date.foo()` => `"Date.foo()"`
			// `Date` | `[Date]`, not followed by .now() => `Date` | `Date[]`
			// `ObjectId` | `[ObjectId]` => `ObjectId` | `ObjectId[]`
			// `Boolean | `[Boolean]` => `boolean` | `boolean[]`
			// `Number` | `[Number]` => `number` | `number[]`
			// `String` | `[String]` => `string` | `string[]`

			// WORKING. CURRENTLY COMMENTED BECAUSE OF ARRAYS:

			// .replace(/Date\.([^\s]+)\([^]*\)/g, '"Date.$1()"')
			// .replace(/(\[)?Date(\])?(?!\.now\(\))/g, '"Date$1$2"')
			// .replace(/(\[)?ObjectId(\])?/g, '"ObjectId$1$2"')
			// .replace(/(\[)?Boolean(\])?/g, '"boolean$1$2"')
			// .replace(/(\[)?Number(\])?/g, '"number$1$2"')
			// .replace(/(\[)?String(\])?/g, '"string$1$2"');

			// USE THIS IF YOU WANT TO HAVE THE ARRAYS LINED UP AROUND THE VARIABLE: (working) #this
			.replace(/Date\.([^\s]+)\([^]*\)/g, '"Date.$1()"')
			.replace(/(\[)?Date(\])?(?!\.now\(\))/g, '"$1Date$2"')

			//

			.replace(/(\[)?ObjectId(\])?/g, '"$1ObjectId$2"')
			.replace(/(\[)?Boolean(\])?/g, '"$1boolean$2"')
			.replace(/(\[)?Number(\])?/g, '"$1number$2"')
			.replace(/(\[)?Decimal128(\])?/g, '"$1Decimal128$2"')

			// .replace(/(?:(\[)?String(\])?)(?!\:)/g, '"$1string$2"');

			.replace(/(?<=:*?)""/g, '"string"') // `foo: ""` => `foo: "string"`

			// "String" | "[String]" | [String] | String => "string" | "[string]"
			.replace(/(?:(?:")?(\[)?(?:String)(\])?(?:")?)(?!\:)/g, '"$1string$2"')

			// any other not yet quoted type into quoted `type` or quoted `[type]`
			.replace(/(?<=:(?:[\s\n\r])*?)(\[)?([A-Za-z]+)(\])?/g, '"$1$2$3"');
		// .replace(/(?<=:(?:[\s\n\r])*?)(\[)?((?<=[A-Za-z])\w+)(\])?/g, '"$1$2$3"');

		// /(?<=:(?:[\s\n\r])*?)[a-z]+/g
		// (?<=:(?:[\s\n\r])*?)\[?[A-Za-z]+\]?

		// import the JS object. Got ERRORS here? The parsed is broken (rawSchemaContent.replace()....)
		const parsedSchemaAsJSObject = eval(schemaContentPreparedForImportingAndJSON); // Got ERRORS here? The parsed is broken (rawSchemaContent.replace()....)

		// turn into json string (great) (optional)
		let rawJSONStrObj = JSON.stringify(parsedSchemaAsJSObject);

		// #LOGGING #CLEANUP
		// console.log("\n");
		// console.log(index, modelFile);
		// console.log(rawJSONStrObj, "\n");

		// Write the *raw* JSON file
		fs.writeFileSync(
			path.join(pathToRawJSONOutputDir, `${toFilename(modelFile)}.raw.json`),
			rawJSONStrObj
		);

		// #LOGGING #CLEANUP
		// Object.entries(parsedSchemaAsJSObject).forEach(([key, value], index) => {
		// 	console.log(index, key, value, typeof value, Array.isArray(value) ? "array" : "");
		// });

		/*
		 *	THE ABSOLUTELY LEGENDARY FUNCTION LADIES AND GENTLEMEN
		 *
		 *	- An ABSOLUTE UNIT, - Kipras 💪
		 *	- A TRUE MASTERPIECE, - Everyone 😍
		 *	- How on Earth does it work?! - You 😱😭😥
		 *
		 */
		const typeScriptTypeDefinitionsAsJSON = JSON.stringify(
			convertCleanMongooseSchemaToTypeScriptReadyJSObject(
				parsedSchemaAsJSObject,
				modelFileNameArray
			)
		);

		// Write the *clean* JSON file
		fs.writeFileSync(
			`${pathToCleanJSONOutputDir}/${toFilename(modelFile)}.clean.json`,
			typeScriptTypeDefinitionsAsJSON
		);

		const typeScriptTypeDefinitions = typeScriptTypeDefinitionsAsJSON
			.replace(/"([^]*?)"/g, "$1")
			.replace(/,/g, ";")
			.replace(/\\/g, "");

		// I no longer need these but I might want to experiment with them and I'm afraid to delete them lol #CLEANUP
		// .replace(/\[[^]*?\{([^]*?)\}[^]*?\]/g, "Array<{$1}>");
		// /\[(?:.|[\r\n])*?\{(.*?)\}(?:.|[\r\n])*?\]/g;
		// /\[(?:.|[\r\n])*?\{([^\}\]]*?)/g;

		const fileNameNoExt = toFilename(modelFile, false); //modelFile.replace(/.*[\/\\](.*)\..*/g, "$1");

		const typeScriptInterface = `export interface I${fileNameNoExt} \
${typeScriptTypeDefinitions}\n`;

		const formattedTypeScriptInterface = disableFormatting
			? typeScriptInterface
			: prettier.format(typeScriptInterface, prettierOptions);

		// write type definitions if any exist
		if (Object.keys(typeScriptTypeDefinitionsAsJSON).length > 0) {
			// Write separately, thus also include `requiredImportsForTypeScriptInterfaces`
			fs.writeFileSync(
				path.join(pathToTypeDefOutputDir, `${fileNameNoExt}.d.ts`),
				`\
${formattingInfo}\n
${requiredImportsForTypeScriptInterfaces}\n
${formattedTypeScriptInterface}`
			);

			// Write into single `relPathToIndexDDDTsFile` ("index.d.ts") file
			// Thus do NOT add `requiredImportsForTypeScriptInterfaces` here
			indexDDDTsFileStream.write("\n" + formattedTypeScriptInterface);
		}
	} /** for (const modelFile of relFilePathArray) */

	indexDDDTsFileStream.end();

	// * #TODO #FIXME #WARNING #BROKEN #copyFix => copy index.d.ts file to `pathToTypeDefOutputDir`
	// console.log(
	// 	"from",
	// 	path.join(__dirname, relPathToIndexDDDTsFile),
	// 	"to",
	// 	path.join(pathToTypeDefOutputDir, "index.d.ts")
	// );

	// fs.copyFileSync(
	// 	path.join(__dirname, relPathToIndexDDDTsFile),
	// 	path.join(pathToTypeDefOutputDir, "index.d.ts")
	// );

	console.log(
		`
⚡️ ${chalk.cyanBright("Tongoose")} finished \

📂 Created \`${chalk.green(`${pathToDotTongooseDir.replace(/.*[\/\\]/g, "")}`)}\` \
directory for manual debugging (you can safely delete it) \

📘 Main \`${chalk.greenBright(relPathToIndexDDDTsFile.replace(/.*[\/\\]/g, ""))}\` \
file placed in 👉  \
\`${chalk.greenBright(toClickablePath(relPathToIndexDDDTsFile))}\` \
(${chalk.green("click it!")})

👪 Get involved - give feedback, report bugs & more @ 
🔗 ${chalk.cyanBright(repository)} 
🚀 Best of luck!
`
	);
})(); /** doTheMagicMongooseSchemaIntoJSONObjectsAndTSTypeDefinitionFilesParsing */
