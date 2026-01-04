#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';

// Wallet file locations
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const WALLET_DIR = path.join(HOME_DIR, '.agentstore');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');
const TX_HISTORY_FILE = path.join(WALLET_DIR, 'tx_history.json');

// mev-commit RPC for Ethereum mainnet
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

interface WalletConfig {
  address: string;
  createdAt: string;
  network: 'mainnet';
  rpcEndpoint: string;
  spendLimits: {
    perTransaction: number;
    daily: number;
    weekly: number;
  };
  allowedPublishers: string[];
}

interface TransactionRecord {
  txHash: string;
  to: string;
  amountEth: string;
  amountUsd: number;
  agentId: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
}

// Helper functions
function loadWalletConfig(): WalletConfig | null {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

function loadTransactionHistory(): TransactionRecord[] {
  try {
    if (fs.existsSync(TX_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(TX_HISTORY_FILE, 'utf-8'));
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return [];
}

async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    const data = (await response.json()) as { ethereum?: { usd?: number } };
    return data.ethereum?.usd || 2000;
  } catch {
    return 2000; // Fallback price
  }
}

async function main() {
  const server = new Server(
    {
      name: 'wallet-assistant',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_balance',
          description: 'Get the current wallet balance in ETH and USD',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_transactions',
          description: 'Get recent transaction history with details about each payment',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of transactions to return (default: 10)',
              },
              status: {
                type: 'string',
                enum: ['pending', 'confirmed', 'failed', 'all'],
                description: 'Filter by transaction status',
              },
            },
            required: [],
          },
        },
        {
          name: 'get_spending_stats',
          description: 'Get spending statistics including daily and weekly limits and usage',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_wallet_config',
          description: 'Get wallet configuration including address, network, and spend limits',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_eth_price',
          description: 'Get the current ETH price in USD',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_balance': {
          const config = loadWalletConfig();
          if (!config) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Wallet not configured',
                    message: 'No wallet found. Run /wallet setup to create one.',
                  }),
                },
              ],
            };
          }

          const balanceWei = await publicClient.getBalance({
            address: config.address as `0x${string}`,
          });
          const balanceEth = formatEther(balanceWei);
          const ethPrice = await getEthPrice();
          const balanceUsd = parseFloat(balanceEth) * ethPrice;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  address: config.address,
                  balance: {
                    wei: balanceWei.toString(),
                    eth: balanceEth,
                    usd: Math.round(balanceUsd * 100) / 100,
                  },
                  ethPrice: ethPrice,
                  network: config.network,
                }),
              },
            ],
          };
        }

        case 'get_transactions': {
          const txArgs = args as { limit?: number; status?: string } | undefined;
          const limit = txArgs?.limit || 10;
          const statusFilter = txArgs?.status || 'all';

          let transactions = loadTransactionHistory();

          // Filter by status
          if (statusFilter !== 'all') {
            transactions = transactions.filter((tx) => tx.status === statusFilter);
          }

          // Sort by timestamp descending and limit
          transactions = transactions
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);

          // Calculate totals
          const totalSpent = transactions
            .filter((tx) => tx.status === 'confirmed')
            .reduce((sum, tx) => sum + tx.amountUsd, 0);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: transactions.length,
                  totalSpentUsd: Math.round(totalSpent * 100) / 100,
                  transactions: transactions.map((tx) => ({
                    txHash: tx.txHash,
                    to: tx.to,
                    amountEth: tx.amountEth,
                    amountUsd: tx.amountUsd,
                    agentId: tx.agentId,
                    timestamp: tx.timestamp,
                    status: tx.status,
                  })),
                }),
              },
            ],
          };
        }

        case 'get_spending_stats': {
          const config = loadWalletConfig();
          if (!config) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Wallet not configured',
                    message: 'No wallet found. Run /wallet setup to create one.',
                  }),
                },
              ],
            };
          }

          const transactions = loadTransactionHistory();
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

          const dailySpent = transactions
            .filter(
              (tx) =>
                new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed'
            )
            .reduce((sum, tx) => sum + tx.amountUsd, 0);

          const weeklySpent = transactions
            .filter(
              (tx) =>
                new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed'
            )
            .reduce((sum, tx) => sum + tx.amountUsd, 0);

          // Calculate spending by agent
          const agentSpending: Record<string, number> = {};
          transactions
            .filter((tx) => tx.status === 'confirmed')
            .forEach((tx) => {
              agentSpending[tx.agentId] = (agentSpending[tx.agentId] || 0) + tx.amountUsd;
            });

          const topAgents = Object.entries(agentSpending)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([agentId, amount]) => ({ agentId, amountUsd: Math.round(amount * 100) / 100 }));

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  daily: {
                    spent: Math.round(dailySpent * 100) / 100,
                    limit: config.spendLimits.daily,
                    remaining: Math.round((config.spendLimits.daily - dailySpent) * 100) / 100,
                    percentUsed: Math.round((dailySpent / config.spendLimits.daily) * 100),
                  },
                  weekly: {
                    spent: Math.round(weeklySpent * 100) / 100,
                    limit: config.spendLimits.weekly,
                    remaining: Math.round((config.spendLimits.weekly - weeklySpent) * 100) / 100,
                    percentUsed: Math.round((weeklySpent / config.spendLimits.weekly) * 100),
                  },
                  perTransaction: {
                    limit: config.spendLimits.perTransaction,
                  },
                  topAgentsBySpending: topAgents,
                  totalTransactions: transactions.length,
                }),
              },
            ],
          };
        }

        case 'get_wallet_config': {
          const config = loadWalletConfig();
          if (!config) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Wallet not configured',
                    message: 'No wallet found. Run /wallet setup to create one.',
                    walletDir: WALLET_DIR,
                  }),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  address: config.address,
                  network: config.network,
                  rpcEndpoint: config.rpcEndpoint,
                  createdAt: config.createdAt,
                  spendLimits: config.spendLimits,
                  allowedPublishers:
                    config.allowedPublishers.length > 0
                      ? config.allowedPublishers
                      : 'All publishers allowed',
                }),
              },
            ],
          };
        }

        case 'get_eth_price': {
          const ethPrice = await getEthPrice();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ethereum: {
                    usd: ethPrice,
                    source: 'CoinGecko',
                    timestamp: new Date().toISOString(),
                  },
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Wallet Assistant MCP server running on stdio');
}

main().catch(console.error);
