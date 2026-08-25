// Primeiro: todas as variaveis do sistema vivem aqui e so aqui.
import "./tokens.css";
import "./patrimonio.css";
import "./enterprise.css";
// Ultima: e a camada que decide superficie. Ver o cabecalho do arquivo.
import "./glass.css";
// Depois de tudo: as utilitarias precisam poder vencer a regra semantica.
import "./tailwind.css";

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
