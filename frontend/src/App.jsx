import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import AccountGrid from "./components/AccountGrid";
import AccountForm from "./components/AccountForm";

const API = "http://localhost:3000";

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await axios.get(`${API}/accounts`);
      setAccounts(res.data);
    } catch (error) {
      console.error("Error al sincronizar el servidor central:", error);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAccountCreated = (newAccount) => {
    const fallbackAccount = newAccount?.account ? newAccount.account : newAccount;
    setAccounts((prev) => [fallbackAccount, ...prev]);
    setOpenForm(false);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/accounts/${id}`);
      fetchAccounts();
    } catch (error) {
      console.error("Error en el protocolo de eliminación:", error);
    }
  };

  const handleRefresh = async (id) => {
    try {
      await axios.post(`${API}/accounts/${id}/refresh`);
      fetchAccounts();
    } catch (error) {
      console.error("Error en la solicitud de sincronización:", error);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      await axios.post(`${API}/accounts/refresh-all`);
      await fetchAccounts();
    } catch (error) {
      console.error("Error en la sincronización masiva:", error);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-zinc-100 p-4 md:p-8 overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.08),transparent_50%)] pointer-events-none" />
      <div 
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: `linear-gradient(to right, #22d3ee 1px, transparent 1px), linear-gradient(to bottom, #22d3ee 1px, transparent 1px)`,
          backgroundSize: "40px 40px"
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto">
        
        <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-12 pb-6 border-b border-zinc-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-2 h-6 bg-cyan-400 rounded-sm animate-pulse" />
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 font-mono">
                LEAGUE_ACCOUNT_MANAGER
              </h1>
              <p className="text-[10px] text-cyan-400/60 tracking-widest font-mono uppercase mt-0.5">
                // Terminal Operativa del Servidor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleRefreshAll}
              disabled={isRefreshingAll}
              className={`w-full sm:w-auto px-4 py-2.5 font-mono text-[10px] font-bold tracking-widest rounded border transition-all ${
                isRefreshingAll 
                  ? "bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed" 
                  : "bg-transparent text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10"
              }`}
            >
              {isRefreshingAll ? "SINCRONIZANDO..." : "REFRESCAR_TODO"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, boxShadow: "0 0 20px rgba(34,211,238,0.4)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setOpenForm(true)}
              className="w-full sm:w-auto px-5 py-2.5 font-mono text-xs font-bold tracking-widest bg-cyan-400 text-zinc-950 rounded border border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-colors hover:bg-cyan-300 cursor-pointer text-center"
            >
              + VINCULAR_NUEVA_CUENTA
            </motion.button>
          </div>
        </header>

        <AnimatePresence>
          {openForm && (
            <AccountForm
              onClose={() => setOpenForm(false)}
              onCreated={handleAccountCreated}
            />
          )}
        </AnimatePresence>

        <main>
          <AccountGrid
            accounts={accounts}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        </main>
      </div>
    </div>
  );
}