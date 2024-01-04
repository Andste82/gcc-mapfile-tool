import { createReadStream } from 'fs';
import { createInterface } from 'readline';

/**
 * @typedef {Object} parseMapfileOptions
 * @property {string} filepath - Path to a GCC Mapfile
 * @property {"name" | "origin" | "length" | "archive" | "object"} [sortby] - Sort JSON arrays by field name
 * @property {"asc" | "desc"} [order] - Sort order
 * @property {"object" | "table"} [format] - Output format
 */

/**
 * Parse a GCC Mapfile
 * Discarded sections are ignored!
 * @param {parseMapfileOptions} options
 * @returns {Promise.<Object>}
 */
export const parseMapfile = async (options) =>
{
	const fileStream = createReadStream(options.filepath);

	const rl = createInterface(
	{
		input: fileStream,
		crlfDelay: Infinity
	});

	let map = [];
	let section;
	let state = 0;
	let name;

	const findMemory = (section) =>
	{
		for (const name in map)
		{
			const region = map[name];
			if (section.origin >= region.origin && section.origin <= region.origin + region.length)
			{
				return region;
			}
		}
	}

	for await (const line of rl)
	{
		switch (state)
		{
			case 0:	// idle
			{
				// search start of memory configuration
				if (line === "Memory Configuration")
				{
					state = 1;
				}

				break;
			}

			case 1: // parse memory configuration
			{
				// until start of memory map ...
				if (line != "Linker script and memory map")
				{
					// ... parse memory configuration
					const found = line.match(/^(\S+)\s+0x(\S+)\s+0x(\S+)\s+([rwx]+)$/);
					if (found)
					{
						const mem = {
							name: found[1],
							origin: parseInt(found[2], 16),
							length: parseInt(found[3], 16),
							attributes: found[4],
							sections: [],
						}

						map.push(mem);
					}
				}
				else
				{
					// memory map found
					state = 2;
				}

				break;
			}

			case 2: // parse memory map
			{
				// check for section start
				if (line[0] === '.')
				{
					// check for one-line section definition ...
					const found = line.match(/^(\S*)\s+0x(\S*)\s+0x(\S*)/);
					if (found)
					{
						section = {
							name: found[1],
							origin: parseInt(found[2], 16),
							length: parseInt(found[3], 16),
							symbols: [],
						}

						if (section.origin > 0)
						{
							const mem = findMemory(section);
							mem.sections.push(section);
						}
						else
						{
							section = null;
						}
					}
					else
					{
						// check for multi-line section definition ...
						const found = line.match(/^(\S*)$/);
						if (found)
						{
							// store section name and parse next line ...
							name = found[1];
							state = 3;
						}
					}
				}
				else if (section && line[0] === ' ' && line[1] !== '*')
				{
					// check for one-line symbol definition with archive(object) info
					const found = line.match(/^\s(\S+)\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S+)\((\S+)\)$/);
					if (found)
					{
						const symbol = {
							name: found[1],
							origin: parseInt(found[2], 16),
							length: parseInt(found[3], 16),
							archive: found[4],
							object: found[5],
						}

						section.symbols.push(symbol);
					}
					else
					{
						// check for one-line symbol definition with only object info
						const found = line.match(/^\s(\S+)\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S+)$/);
						if (found)
						{
							const symbol = {
								name: found[1],
								origin: parseInt(found[2], 16),
								length: parseInt(found[3], 16),
								object: found[4],
							}

							section.symbols.push(symbol);
						}
						else
						{
							// check for multi-line symbol definition ...
							const found = line.match(/^\s(\S*)$/);
							if (found)
							{
								// store symbol name and parse next line ...
								name = found[1];
								state = 4;
							}
						}
					}
				}

				break;
			}

			case 3: // parse two-line section defintion
			{
				// check for second line of section defintion
				const found = line.match(/^\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)$/);
				if (found)
				{
					section = {
						name,
						origin: parseInt(found[1], 16),
						length: parseInt(found[2], 16),
						symbols: [],
					}

					if (section.origin > 0)
					{
						const mem = findMemory(section);
						mem.sections.push(section);
					}
					else
					{
						section = null;
					}
				}

				state = 2;
				break;
			}

			case 4: // parse two-line symbol definition
			{
				// check for second line of symbol defintion with archive(object) info
				const found = line.match(/^\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S+)\((\S+)\)$/);
				if (found)
				{
					const symbol = {
						name,
						origin: parseInt(found[1], 16),
						length: parseInt(found[2], 16),
						archive: found[3],
						object: found[4],
					}

					section.symbols.push(symbol);
				}
				else
				{
					// check for second line of symbol defintion with only object info
					const found = line.match(/^\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S+)$/);
					if (found)
					{
						const symbol = {
							name,
							origin: parseInt(found[1], 16),
							length: parseInt(found[2], 16),
							object: found[3],
						}

						section.symbols.push(symbol);
					}
				}

				state = 2;
				break;
			}
		}
	}

	if (options.sortby)
	{
		let compare;
		if (options.order === 'desc')
		{
			compare = (a, b) => (a[options.sortby] < b[options.sortby]) ? 1 : -1;
		}
		else
		{
			compare = (a, b) => (a[options.sortby] > b[options.sortby]) ? 1 : -1;
		}

		for (const mem of map)
		{
			for (const section of mem.sections)
			{
				section.symbols.sort(compare);
			}

			mem.sections.sort(compare);
		}
	}

	if (options.format === 'table')
	{
		const table = [];

		for (const mem of map)
		{
			for (const section of mem.sections)
			{
				for (const symbol of section.symbols)
				{
					table.push(
					[
						mem.name,
						section.name,
						symbol.name,
						`0x${symbol.origin.toString(16)}`,
						symbol.length,
						symbol.archive,
						symbol.object
					]);
				}
			}
		}

		return table;
	}

	return map;
}