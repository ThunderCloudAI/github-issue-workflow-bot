import { readFileSync, writeFileSync } from 'fs';
import { parseMessage, ParsedMessage } from './src/message-parser.js';

function parseBlahOut(filePath: string): ParsedMessage[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const messages: ParsedMessage[] = [];
  const unparsableLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const message = parseMessage(line);
      messages.push(message);
    } catch (error) {
      console.error(
        `Error parsing line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error(`Line content: ${line.substring(0, 100)}...`);
      unparsableLines.push(line);
    }
  }

  // Write unparsable lines to file
  if (unparsableLines.length > 0) {
    writeFileSync('./unparsable.out', unparsableLines.join('\n') + '\n');
    console.log(`\nWrote ${unparsableLines.length} unparsable lines to unparsable.out`);
  }

  return messages;
}

// Parse the file
const messages = parseBlahOut('./blah.min.out');

console.log(`Parsed ${messages.length} messages from blah.min.out`);
console.log('\nMessage types:');
const typeCounts = messages.reduce(
  (acc, msg) => {
    const key = msg.type === 'system' ? `system-${msg.subtype || 'unknown'}` : msg.type;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);

Object.entries(typeCounts).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

// Calculate total cost
const totalCost = messages.reduce((sum, msg) => {
  if (msg.type === 'system' || msg.type === 'result') {
    return sum + (msg.totalCostUsd || 0);
  }
  return sum;
}, 0);

console.log(`\nTotal Cost: $${totalCost.toFixed(6)}`);

// Show cost breakdown by message type
console.log('\nCost breakdown:');
const costByType = messages.reduce(
  (acc, msg) => {
    if ((msg.type === 'system' || msg.type === 'result') && msg.totalCostUsd) {
      const key = msg.type === 'system' ? `system-${msg.subtype || 'unknown'}` : msg.type;
      acc[key] = (acc[key] || 0) + msg.totalCostUsd;
    }
    return acc;
  },
  {} as Record<string, number>
);

Object.entries(costByType).forEach(([type, cost]) => {
  console.log(`  ${type}: $${cost.toFixed(6)}`);
});

// Show first few messages as examples
console.log('\nFirst 3 messages:');
messages.slice(0, 3).forEach((msg, i) => {
  console.log(`\n${i + 1}. Type: ${msg.type}`);
  if (msg.type === 'system') {
    console.log(`   Subtype: ${msg.subtype}`);
    console.log(`   CWD: ${msg.cwd}`);
    if (msg.totalCostUsd) console.log(`   Cost: $${msg.totalCostUsd.toFixed(6)}`);
  } else if (msg.type === 'result') {
    console.log(`   Subtype: ${msg.subtype}`);
    if (msg.totalCostUsd) console.log(`   Cost: $${msg.totalCostUsd.toFixed(6)}`);
    console.log(`   Duration: ${msg.durationMs}ms`);
  } else {
    console.log(`   Role: ${msg.role}`);
    console.log(`   Content items: ${msg.content?.length || 0}`);
  }
});
