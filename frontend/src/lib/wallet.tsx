"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider } from "ethers";
import { SiweMessage } from "siwe";
import { API_URL, CHAIN_ID, api, getSessionToken, setSessionToken } from "./api";

type WalletCtx = {
  address: string | null;
  connecting: boolean;
  authenticated: boolean;
  authMethod: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authMethod, setAuthMethod] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setAuthenticated(false);
      setAuthMethod(null);
      return;
    }
    try {
      const session = await api<{ wallet: string; authMethod: string }>("/api/auth/session", {
        token,
      });
      setAddress(session.wallet.toLowerCase());
      setAuthenticated(true);
      setAuthMethod(session.authMethod);
    } catch {
      setSessionToken(null);
      setAuthenticated(false);
      setAuthMethod(null);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const ensureAmoy = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask required");
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) === CHAIN_ID) return provider;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${CHAIN_ID.toString(16)}`,
            chainName: "Polygon Amoy",
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            rpcUrls: ["https://rpc-amoy.polygon.technology"],
            blockExplorerUrls: ["https://amoy.polygonscan.com"],
          },
        ],
      });
    }
    return new BrowserProvider(window.ethereum);
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask required. Connect to Polygon Amoy (chainId 80002).");
      return;
    }
    setConnecting(true);
    try {
      const provider = await ensureAmoy();
      const signer = await provider.getSigner();
      const addr = (await signer.getAddress()).toLowerCase();

      const nonceRes = await fetch(`${API_URL}/api/auth/nonce?address=${addr}`);
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok) throw new Error(nonceData.error || "Failed to get nonce");

      const message = new SiweMessage({
        domain: nonceData.domain,
        address: await signer.getAddress(),
        statement: nonceData.statement,
        uri: nonceData.uri,
        version: "1",
        chainId: nonceData.chainId,
        nonce: nonceData.nonce,
      });
      const prepared = message.prepareMessage();
      const signature = await signer.signMessage(prepared);

      const verified = await api<{
        token: string;
        wallet: string;
        authMethod: string;
      }>("/api/auth/verify", {
        method: "POST",
        body: { message: prepared, signature },
        token: null,
      });

      setSessionToken(verified.token);
      setAddress(verified.wallet.toLowerCase());
      setAuthenticated(true);
      setAuthMethod(verified.authMethod);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "SIWE sign-in failed");
    } finally {
      setConnecting(false);
    }
  }, [ensureAmoy]);

  const disconnect = useCallback(async () => {
    try {
      const token = getSessionToken();
      if (token) {
        await api("/api/auth/logout", { method: "POST", token });
      }
    } catch {
      /* ignore */
    }
    setSessionToken(null);
    setAddress(null);
    setAuthenticated(false);
    setAuthMethod(null);
  }, []);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accs = args[0] as string[];
      const next = accs?.[0]?.toLowerCase() || null;
      if (next && address && next !== address) {
        disconnect();
      }
    };
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, [address, disconnect]);

  const value = useMemo(
    () => ({ address, connecting, authenticated, authMethod, connect, disconnect }),
    [address, connecting, authenticated, authMethod, connect, disconnect]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}
