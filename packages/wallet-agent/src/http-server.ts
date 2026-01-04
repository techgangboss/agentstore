#!/usr/bin/env node
/**
 * HTTP MCP Server for Wallet Assistant
 * This version runs as an HTTP server that the gateway can proxy to.
 *
 * Usage: node dist/http-server.js [port]
 * Default port: 3456
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http as viemHttp, formatEther } from 'viem';
import { mainnet } from 'viem/chains';

const PORT = parseInt(process.env.PORT || '3456', 10);

// Wallet file locations
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const WALLET_DIR = path.join(HOME_DIR, '.agentstore');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');
const TX_HISTORY_FILE = path.join(WALLET_DIR, 'tx_history.json');

const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: viemHttp(MEV_COMMIT_RPC),
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

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  id: number | string;
}

function loadWalletConfig(): WalletConfig | null {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function loadTransactionHistory(): TransactionRecord[] {
  try {
    if (fs.existsSync(TX_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(TX_HISTORY_FILE, 'utf-8'));
    }
  } catch {
    // ignore
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
    return 2000;
  }
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ result?: unknown; error?: { message: string } }> {
  switch (name) {
    case 'get_balance': {
      const config = loadWalletConfig();
      if (!config) {
        return {
          result: {
            error: 'Wallet not configured',
            message: 'No wallet found. Run /wallet setup to create one.',
          },
        };
      }

      const balanceWei = await publicClient.getBalance({
        address: config.address as `0x${string}`,
      });
      const balanceEth = formatEther(balanceWei);
      const ethPrice = await getEthPrice();
      const balanceUsd = parseFloat(balanceEth) * ethPrice;

      return {
        result: {
          address: config.address,
          balance: {
            wei: balanceWei.toString(),
            eth: balanceEth,
            usd: Math.round(balanceUsd * 100) / 100,
          },
          ethPrice,
          network: config.network,
        },
      };
    }

    case 'get_transactions': {
      const limit = (args.limit as number) || 10;
      const statusFilter = (args.status as string) || 'all';

      let transactions = loadTransactionHistory();

      if (statusFilter !== 'all') {
        transactions = transactions.filter((tx) => tx.status === statusFilter);
      }

      transactions = transactions
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      const totalSpent = transactions
        .filter((tx) => tx.status === 'confirmed')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

      return {
        result: {
          count: transactions.length,
          totalSpentUsd: Math.round(totalSpent * 100) / 100,
          transactions,
        },
      };
    }

    case 'get_spending_stats': {
      const config = loadWalletConfig();
      if (!config) {
        return {
          result: {
            error: 'Wallet not configured',
            message: 'No wallet found. Run /wallet setup to create one.',
          },
        };
      }

      const transactions = loadTransactionHistory();
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const dailySpent = transactions
        .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

      const weeklySpent = transactions
        .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

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
        result: {
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
          perTransaction: { limit: config.spendLimits.perTransaction },
          topAgentsBySpending: topAgents,
          totalTransactions: transactions.length,
        },
      };
    }

    case 'get_wallet_config': {
      const config = loadWalletConfig();
      if (!config) {
        return {
          result: {
            error: 'Wallet not configured',
            message: 'No wallet found. Run /wallet setup to create one.',
            walletDir: WALLET_DIR,
          },
        };
      }

      return {
        result: {
          address: config.address,
          network: config.network,
          rpcEndpoint: config.rpcEndpoint,
          createdAt: config.createdAt,
          spendLimits: config.spendLimits,
          allowedPublishers:
            config.allowedPublishers.length > 0
              ? config.allowedPublishers
              : 'All publishers allowed',
        },
      };
    }

    case 'get_eth_price': {
      const ethPrice = await getEthPrice();
      return {
        result: {
          ethereum: {
            usd: ethPrice,
            source: 'CoinGecko',
            timestamp: new Date().toISOString(),
          },
        },
      };
    }

    default:
      return { error: { message: `Unknown tool: ${name}` } };
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const request = JSON.parse(body) as JsonRpcRequest;

      if (request.method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: [
                {
                  name: 'get_balance',
                  description: 'Get the current wallet balance in ETH and USD',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                },
                {
                  name: 'get_transactions',
                  description: 'Get recent transaction history',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      limit: { type: 'number' },
                      status: { type: 'string', enum: ['pending', 'confirmed', 'failed', 'all'] },
                    },
                  },
                },
                {
                  name: 'get_spending_stats',
                  description: 'Get spending statistics',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                },
                {
                  name: 'get_wallet_config',
                  description: 'Get wallet configuration',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                },
                {
                  name: 'get_eth_price',
                  description: 'Get the current ETH price in USD',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                },
              ],
            },
          })
        );
        return;
      }

      if (request.method === 'tools/call') {
        const toolName = request.params?.name || '';
        const toolArgs = (request.params?.arguments as Record<string, unknown>) || {};

        const result = await handleToolCall(toolName, toolArgs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            ...result,
          })
        );
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { message: `Unknown method: ${request.method}` },
        })
      );
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { message: error instanceof Error ? error.message : 'Internal error' },
        })
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`Wallet Assistant MCP HTTP server running on http://localhost:${PORT}`);
  console.log('Ready to receive tool calls from AgentStore gateway');
});
