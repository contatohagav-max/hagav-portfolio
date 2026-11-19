// CPF e CNPJ: mascara enquanto digita e conferencia dos digitos verificadores.

export function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function formatarDocumento(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function cpfValido(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (base) => {
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(d.slice(0, 9)) === Number(d[9]) && digito(d.slice(0, 10)) === Number(d[10]);
}

export function cnpjValido(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

// Texto curto para mostrar embaixo do campo.
export function situacaoDocumento(valor) {
  const d = somenteDigitos(valor);
  if (!d) return { ok: null, texto: 'Opcional, mas deixa o contrato mais seguro.' };
  if (d.length === 11) return cpfValido(d) ? { ok: true, texto: 'CPF válido.' } : { ok: false, texto: 'CPF inválido: confira os números.' };
  if (d.length === 14) return cnpjValido(d) ? { ok: true, texto: 'CNPJ válido.' } : { ok: false, texto: 'CNPJ inválido: confira os números.' };
  return { ok: false, texto: 'Digite os 11 números do CPF ou os 14 do CNPJ.' };
}
