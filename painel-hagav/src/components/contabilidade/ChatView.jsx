'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, RefreshCw, Send, Trash2 } from 'lucide-react';

const SUGESTOES = [
  'Posso comprar uma câmera de R$ 8 mil agora?',
  'Quanto devo guardar por mês e onde deixar esse dinheiro?',
  'Com o que estamos gastando demais?',
  'O que fazer para chegar na meta de faturamento?',
  'Quanto podemos retirar como sócios sem prejudicar o caixa?',
];
const STORAGE_KEY = 'hagav-contabilidade-chat';

export default function ChatView({ resumo }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);

  useEffect(() => {
    try {
      const salvo = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(salvo)) setMensagens(salvo.slice(-20));
    } catch {
      // sem historico salvo
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mensagens.slice(-20)));
    } catch {
      // armazenamento indisponivel
    }
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens]);

  async function enviar(pergunta) {
    const conteudo = String(pergunta || texto).trim();
    if (!conteudo || enviando) return;
    const novas = [...mensagens, { role: 'user', content: conteudo }];
    setMensagens(novas);
    setTexto('');
    setErro('');
    setEnviando(true);
    try {
      const response = await fetch('/api/contabilidade-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensagens: novas.slice(-12), resumo }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        if (data.error === 'chat_nao_configurado') {
          setErro('O chat ainda não está ligado: falta cadastrar a chave da API do Claude (ANTHROPIC_API_KEY) no Cloudflare.');
        } else if (response.status === 401 || response.status === 403) {
          setErro('Sua sessão expirou ou não tem acesso ao financeiro. Entre de novo no painel.');
        } else {
          setErro(data.message || 'Não consegui responder agora. Tente de novo em instantes.');
        }
        setMensagens(novas);
        return;
      }
      setMensagens([...novas, { role: 'assistant', content: data.resposta }]);
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  function limpar() {
    setMensagens([]);
    setErro('');
  }

  return (
    <div className="hcard p-0 flex flex-col min-h-[520px]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hagav-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-hagav-gold/15 border border-hagav-gold/30 flex items-center justify-center">
            <Bot size={15} className="text-hagav-gold" />
          </div>
          <div>
            <p className="text-sm font-semibold text-hagav-white">CONTABILIDADE HAGAV</p>
            <p className="text-[11px] text-hagav-gray">Responde com base nos números do painel. Para impostos e decisões legais, confirme com o contador.</p>
          </div>
        </div>
        {mensagens.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={limpar} title="Limpar conversa">
            <Trash2 size={13} /> Limpar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-h-[60vh]">
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-hagav-light">Pergunte qualquer decisão de dinheiro. Exemplos:</p>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" className="btn-ghost btn-sm text-left whitespace-normal" onClick={() => enviar(s)} disabled={enviando}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={m.role === 'user'
              ? 'max-w-[85%] rounded-2xl rounded-br-md bg-hagav-gold/15 border border-hagav-gold/30 px-4 py-2.5 text-sm text-hagav-white whitespace-pre-wrap'
              : 'max-w-[90%] rounded-2xl rounded-bl-md bg-hagav-surface border border-hagav-border px-4 py-3 text-sm text-hagav-light whitespace-pre-wrap leading-relaxed'}
            >
              {m.content}
            </div>
          </div>
        ))}
        {enviando && (
          <div className="flex items-center gap-2 text-xs text-hagav-gray">
            <RefreshCw size={13} className="animate-spin text-hagav-gold" /> Analisando os números...
          </div>
        )}
        {erro && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
        <div ref={fimRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-hagav-border px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Ex.: Quero investir R$ 2 mil em anúncios, faz sentido?"
          rows={2}
          className="hinput flex-1 resize-none"
          style={{ minHeight: 48 }}
        />
        <button type="submit" className="btn-gold btn-sm h-12" disabled={enviando || !texto.trim()}>
          <Send size={14} /> Enviar
        </button>
      </form>
    </div>
  );
}
