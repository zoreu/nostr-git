# ngit

**Git descentralizado sobre Nostr + Blossom.**

O `ngit` usa o Git que você já conhece para versionar arquivos localmente. No `push`, ele publica o histórico (bundle Git), os arquivos e um manifesto na rede Nostr/Blossom. No `clone`, ele descobre o repositório pelos relays, baixa o bundle do Blossom e reconstrói o repositório Git completo.

Sem servidor central, sem conta em plataforma: sua identidade é um par de chaves Nostr.

```
npm install -g nostr-git
ngit login --generate
ngit init
ngit add .
ngit commit -m "primeiro commit"
ngit push
ngit web
```

## Recursos

- Comandos no estilo Git: `init`, `add`, `commit`, `push` e `clone`.
- Identidade Nostr via `nsec` (ou geração de chave nova).
- Arquivos armazenados em servidores Blossom com verificação de SHA-256.
- Histórico completo transportado como bundle Git.
- Manifesto web com árvore de arquivos, README e commits.
- Interface local no estilo GitHub: `ngit web`.
- Seleção automática entre vários relays e servidores Blossom.
- Instalável diretamente de um repositório GitHub.

## Requisitos

- Node.js 20 ou superior
- Git 2.28 ou superior

## Instalação

Via npm:

```bash
npm install -g nostr-git
```

Direto do GitHub:

```bash
npm install -g github:SEU-USUARIO/nostr-git
```

Para desenvolvimento local:

```bash
git clone https://github.com/SEU-USUARIO/nostr-git.git
cd nostr-git
npm install
npm link
```

Depois confira:

```bash
ngit --version
ngit --help
```

## Início rápido

### 1. Login

Crie uma identidade nova:

```bash
ngit login --generate
```

Guarde o `nsec` exibido em local seguro. Ele é a única forma de controlar os repositórios publicados com essa identidade.

Para usar uma identidade existente:

```bash
ngit login
# cole o nsec1... quando solicitado
```

Também é possível configurar relays e servidores Blossom:

```bash
ngit login \
  --relays wss://relay.damus.io,wss://nos.lol \
  --blossom https://blossom.primal.net,https://nostr.download
```

### 2. Publicar um projeto

```bash
cd meu-projeto
ngit init
ngit add .
ngit commit -m "primeiro commit"
ngit push
```

Saída parecida com a do Git:

```
Enumerando objetos...
  3 arquivo(s), 167 B
  bundle Git: 917 B
Enviando conteúdo para o Blossom...
  ✓ bundle 593 B https://nostr.download
  ✓ manifesto 1.37 KiB https://blossom.primal.net
Publicando referências no Nostr...
  ✓ wss://nos.lol aceito

To nostr://npub1vnd9.../meu-projeto
   * [new branch]      main -> main
```

O endereço final tem o formato:

```
nostr://npub1.../nome-do-projeto
```

### 3. Clonar em outra máquina

```bash
ngit clone npub1.../meu-projeto
```

Ou escolha a pasta de destino:

```bash
ngit clone npub1.../meu-projeto outra-pasta
```

O `clone` não exige login: qualquer pessoa com o `npub` pode baixar o repositório público.

### 4. Navegar na web

```bash
ngit web
```

Abre `http://127.0.0.1:3737` no navegador com:

- seus repositórios;
- descoberta de repositórios recentes nos relays;
- árvore de arquivos;
- visualização de código e imagens;
- README renderizado;
- histórico de commits;
- comando de clone pronto para copiar.

Abrir direto em um repositório:

```bash
ngit web npub1.../meu-projeto
```

Opções:

```bash
ngit web --port 4000 --host 127.0.0.1 --no-open
```

## Comandos

| Comando | Descrição |
| --- | --- |
| `ngit init [projeto]` | Inicializa o Git e o metadata `.ngit/` |
| `ngit login [--generate]` | Salva ou cria sua identidade Nostr |
| `ngit whoami` | Mostra a identidade logada |
| `ngit add <arquivos...>` | Adiciona arquivos ao índice Git |
| `ngit commit [-m "msg"]` | Cria um commit usando o Git local |
| `ngit push` | Publica commits, bundle, manifesto e arquivos |
| `ngit clone <npub.../projeto> [pasta]` | Clona um repositório do Nostr |
| `ngit web [npub.../projeto]` | Abre a interface web local |
| `ngit help` | Mostra a ajuda |

## Como funciona

Cada repositório é identificado por:

```
autor (pubkey Nostr) + nome do projeto (tag "d")
```

No `push`, o ngit:

1. Executa `git bundle create --all` para empacotar o histórico completo.
2. Lista os arquivos rastreados no commit atual.
3. Envia cada arquivo ao Blossom, endereçado pelo SHA-256 do conteúdo.
4. Gera um manifesto JSON com árvore de arquivos, commits e tipos MIME.
5. Publica um evento de estado Nostr com as referências do bundle e do manifesto.
6. Publica/atualiza o anúncio público do repositório.

Eventos usados:

| Kind | Uso |
| --- | --- |
| `30617` | Anúncio do repositório (compatível com NIP-34) |
| `30618` | Estado do repositório: branch, commit, bundle e manifesto |

Blossom é usado para armazenar:

- bundle Git;
- arquivos individuais;
- manifesto JSON.

Todo conteúdo baixado é verificado pelo SHA-256. Eventos Nostr têm a assinatura verificada antes de serem usados.

## Configuração

Arquivo padrão:

```
~/.ngit/config.json
```

Estrutura simplificada:

```json
{
  "secretKeyHex": "...",
  "pubkeyHex": "...",
  "npub": "npub1...",
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "blossomServers": ["https://blossom.primal.net", "https://nostr.download"]
}
```

Variáveis de ambiente:

| Variável | Efeito |
| --- | --- |
| `NGIT_NSEC` | Usa uma chave do ambiente (sobrepõe a chave salva) |
| `NGIT_RELAYS` | Relays separados por vírgula |
| `NGIT_BLOSSOM_SERVERS` | Servidores Blossom separados por vírgula |
| `NGIT_HOME` | Diretório alternativo para o config |
| `NGIT_CONFIG` | Caminho alternativo para o arquivo de config |
| `NGIT_ALLOW_LOCAL_BLOSSOM` | `1` permite Blossom local/HTTP |
| `NGIT_DEBUG` | Mostra stack trace em erros |

## Segurança

- A chave privada fica em `~/.ngit/config.json` com permissão restrita (`0600` em sistemas POSIX).
- Ela não é criptografada. Use uma identidade dedicada para testes ou um computador confiável.
- Faça backup do `nsec`. Sem ele não é possível atualizar os repositórios.
- Nunca publique seu `nsec`. Ele é diferente do `npub`.
- O `clone` e a interface web são somente leitura e não precisam da chave privada.
- A interface web roda localmente em `127.0.0.1` por padrão.

## Limitações atuais

- `push` publica o estado da branch atual; a interface web mostra a branch principal.
- Não há `pull`, `merge`, issues ou pull requests.
- Relays e servidores Blossom públicos podem ficar indisponíveis; configure alternativas.
- Servidores Blossom públicos podem impor limites de tamanho por arquivo.
- O push carrega arquivos e bundle em memória; repositórios muito grandes podem consumir bastante RAM.
- O bundle completo é gerado a cada push e reenviado quando o histórico muda; arquivos já existentes no Blossom são reaproveitados pelo hash.
- Repositórios privados/criptografados ainda não são suportados.

## Publicar o próprio ngit no GitHub

```bash
git init -b main
git add .
git commit -m "feat: cliente ngit"
git remote add origin https://github.com/SEU-USUARIO/nostr-git.git
git push -u origin main
```

Depois a instalação global pode ser feita com:

```bash
npm install -g github:SEU-USUARIO/nostr-git
```

Para publicar no npm:

```bash
npm publish
```

## Desenvolvimento

```bash
npm install
npm test
node bin/ngit.js --help
npm link
```

Estrutura:

```
bin/            entrada da CLI
src/commands/   init, login, add, commit, push, clone, web
src/lib/        Git, Nostr, Blossom, protocolo, manifesto e servidor web
web/            interface HTML/CSS/JS
test/           testes unitários
```

## Licença

MIT
