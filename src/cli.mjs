#!/bin/sh
":" //# comment; exec /usr/bin/env node --harmony "$0" "$@"

import commandLineArgs from 'command-line-args';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { parseMapfile } from './parseMapfile.mjs';

const fileExists = async path => !!(await stat(path).catch(() => false))

const main = async () =>
{
	const cli = commandLineArgs(
	[
		{name: "mapfile", type: String, defaultOption: true},
		{name: "output", type: String},
		{name: "sortby", type: String},
		{name: "order", type: String},
		{name: "format", type: String},
	]);

	if (!await fileExists(cli.mapfile))
	{
		throw `file "${cli.mapfile}" not found!`;
	}

	const map = await parseMapfile(
	{
		filepath: cli.mapfile,
		sortby: cli.sortby,
		order: cli.order,
		format: cli.format === 'html' ? 'table' : 'object',
	});

	let data = JSON.stringify(map, null, 2);

	if (cli.format === 'html')
	{
		let template = await readFile('assets/index.html', 'utf8');
		const css = await readFile('assets/datatables.min.css', 'utf8');
		const js = await readFile('assets/datatables.min.js', 'utf8');

		template = template.replace("{{datatables-css}}", css);
		template = template.replace("{{datatables-js}}", js);
		template = template.replace("{{datatables-data}}", data);

		data = template;
	}

	if (cli.output)
	{
		await writeFile(cli.output, data);
	}
	else
	{
		console.log(data);
	}
}

main().catch((e) =>
{
	console.error(e.message ?? e);
});