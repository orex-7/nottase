# Rebuild accented Portuguese text in DatabaseView.tsx (pure-ASCII source).
# The target file was corrupted by three layers over time:
#   1) UTF-8 bytes read as CP1252 -> "AA","A","A" mojibake (reversible)
#   2) accented chars replaced by U+FFFD
#   3) accented chars replaced by literal "?" inside words
# This script reverses layer 1 and rebuilds layers 2/3 from a word dictionary.
# Fixed words are written with [hXXXX] escapes to keep THIS file ASCII-only.
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path (Join-Path $PSScriptRoot '..\src\components\database\DatabaseView.tsx')).Path
$U = [char]0xFFFD

function Fx([string]$s) {
  # Resolve [hXXXX] hex codepoint markers into real characters.
  return [regex]::Replace($s, '\[h([0-9A-Fa-f]{4})\]', {
    param($m); [char]([Convert]::ToInt32($m.Groups[1].Value, 16)) })
}

$raw = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
# Layer 1: reverse CP1252 mojibake (byte-exact round trip).
$text = [System.Text.Encoding]::UTF8.GetString(
  [System.Text.Encoding]::GetEncoding(1252).GetBytes($raw))

# Dictionary: [broken-with-B] -> fixed (ASCII + [hXXXX] escapes).
$pairs = @(
  @('opBBo','op[h00E7][h00E3]o'), @('OpBBes','Op[h00E7][h00F5]es'),
  @('opBBes','op[h00E7][h00F5]es'),
  @('visualizaBBo','visualiza[h00E7][h00E3]o'),
  @('visualizaBBes','visualiza[h00E7][h00F5]es'),
  @('seleBBo','sele[h00E7][h00E3]o'), @('seBBo','se[h00E7][h00E3]o'),
  @('PosiBBo','Posi[h00E7][h00E3]o'), @('posiBBes','posi[h00E7][h00F5]es'),
  @('agregaBBo','agrega[h00E7][h00E3]o'),
  @('agregaBBes','agrega[h00E7][h00F5]es'),
  @('criaBBo','cria[h00E7][h00E3]o'), @('ediBBo','edi[h00E7][h00E3]o'),
  @('ediBBes','edi[h00E7][h00F5]es'), @('aBBes','a[h00E7][h00F5]es'),
  @('aBBo','a[h00E7][h00E3]o'), @('inserBBo','inser[h00E7][h00E3]o'),
  @('digitaBBo','digita[h00E7][h00E3]o'),
  @('atualizaBBo','atualiza[h00E7][h00E3]o'),
  @('atualizaBBes','atualiza[h00E7][h00F5]es'),
  @('definiBBo','defini[h00E7][h00E3]o'),
  @('ConfirmaBBo','Confirma[h00E7][h00E3]o'),
  @('OperaBBo','Opera[h00E7][h00E3]o'), @('gravaBBo','grava[h00E7][h00E3]o'),
  @('automaBBo','automa[h00E7][h00E3]o'), @('descriBBo','descri[h00E7][h00E3]o'),
  @('renderizaBBo','renderiza[h00E7][h00E3]o'),
  @('funBBes','fun[h00E7][h00F5]es'),
  @('configuraBBes','configura[h00E7][h00F5]es'),
  @('ConfiguraBBo','Configura[h00E7][h00E3]o'),
  @('nBo','n[h00E3]o'), @('NBo','N[h00E3]o'),
  @('botBo','bot[h00E3]o'), @('BotBo','Bot[h00E3]o'),
  @('botBes','bot[h00F5]es'), @('padrBo','padr[h00E3]o'),
  @('PadrBo','Padr[h00E3]o'), @('cabeBalho','cabe[h00E7]alho'),
  @('CabeBalho','Cabe[h00E7]alho'),
  @('calendBrio','calend[h00E1]rio'), @('HorBrio','Hor[h00E1]rio'),
  @('usuBrio','usu[h00E1]rio'), @('frequBncia','frequ[h00EA]ncia'),
  @('recorrBncia','recorr[h00EA]ncia'), @('ocorrBncia','ocorr[h00EA]ncia'),
  @('ocorrBncias','ocorr[h00EA]ncias'),
  @('estB','est[h00E1]'), @('estBo','est[h00E3]o'),
  @('sBo','s[h00E3]o'), @('SBo','S[h00E3]o'), @('senBo','sen[h00E3]o'),
  @('tambBm','tamb[h00E9]m'), @('atB','at[h00E9]'), @('apBs','ap[h00F3]s'),
  @('versBo','vers[h00E3]o'), @('reversBo','revers[h00E3]o'),
  @('gestBo','gest[h00E3]o'), @('tBrmino','t[h00E9]rmino'),
  @('tBm','t[h00EA]m'), @('alBm','al[h00E9]m'), @('mudanBa','mudan[h00E7]a'),
  @('nBvel','n[h00ED]vel'), @('sequBncia','sequ[h00EA]ncia'),
  @('persistBncia','persist[h00EA]ncia'), @('memBria','mem[h00F3]ria'),
  @('propBsito','prop[h00F3]sito'), @('subBrvore','sub[h00E1]rvore'),
  @('rodapB','rodap[h00E9]')
)
$pairs += @(
  @('espaBo','espa[h00E7]o'), @('comeBar','come[h00E7]ar'),
  @('comeBam','come[h00E7]am'), @('lanBar','lan[h00E7]ar'),
  @('conteBdo','conte[h00FA]do'), @('ConteBdo','Conte[h00FA]do'),
  @('grBfico','gr[h00E1]fico'), @('GrBfico','Gr[h00E1]fico'),
  @('mBdulo','m[h00F3]dulo'), @('mBdulos','m[h00F3]dulos'),
  @('mBdia','m[h00E9]dia'), @('mBdias','m[h00E9]dias'),
  @('mBltipla','m[h00FA]ltipla'), @('mBnimo','m[h00ED]nimo'),
  @('mBnima','m[h00ED]nima'), @('mBximo','m[h00E1]ximo'),
  @('mBs','m[h00E1]s'), @('Bcone','[h00ED]cone'), @('Bcones','[h00ED]cones'),
  @('Brea','[h00E1]rea'), @('Brvore','[h00E1]rvore'), @('Bncora','[h00E2]ncora'),
  @('Bltima','[h00FA]ltima'), @('Bltimo','[h00FA]ltimo'), @('Btil','[h00FA]til'),
  @('Bnico','[h00FA]nico'), @('Bnica','[h00FA]nica'),
  @('ConcluBdo','Conclu[h00ED]do'), @('ConcluBdos','Conclu[h00ED]dos'),
  @('numBricas','num[h00E9]ricas'), @('numBrica','num[h00E9]rica'),
  @('numBricos','num[h00E9]ricos'), @('numBrico','num[h00E9]rico'),
  @('NBmero','N[h00FA]mero'), @('nBmeros','n[h00FA]meros'),
  @('nBmero','n[h00FA]mero'), @('prBpria','pr[h00F3]pria'),
  @('prBprios','pr[h00F3]prios'), @('prBprio','pr[h00F3]prio'),
  @('prBximas','pr[h00F3]ximas'), @('prBxima','pr[h00F3]xima'),
  @('PrBxima','Pr[h00F3]xima'), @('rBpidas','r[h00E1]pidas'),
  @('rBpido','r[h00E1]pido'), @('pBginas','p[h00E1]ginas'),
  @('pBgina','p[h00E1]gina'), @('PBgina','P[h00E1]gina'),
  @('AutomBtico','Autom[h00E1]tico'), @('automBtico','autom[h00E1]tico'),
  @('diBlogo','di[h00E1]logo'), @('VocB','Voc[h00EA]'), @('vocB','voc[h00EA]'),
  @('estBvel','est[h00E1]vel'), @('editBvel','edit[h00E1]vel'),
  @('visBveis','vis[h00ED]veis'), @('visBvel','vis[h00ED]vel'),
  @('rolBvel','rol[h00E1]vel'), @('agrupBveis','agrup[h00E1]veis'),
  @('agrupBvel','agrup[h00E1]vel'), @('disponBveis','dispon[h00ED]veis'),
  @('disponBvel','dispon[h00ED]vel'),
  @('redimensionBvel','redimension[h00E1]vel'),
  @('legBvel','leg[h00ED]vel'), @('vBlidos','v[h00E1]lidos'),
  @('vBlido','v[h00E1]lido'), @('vBlida','v[h00E1]lida'),
  @('variBveis','vari[h00E1]veis'), @('atribuBdos','atribu[h00ED]dos'),
  @('atribuBdo','atribu[h00ED]do'), @('distribuBdos','distribu[h00ED]dos'),
  @('realBada','real[h00E7]ada'), @('explBcito','expl[h00ED]cito'),
  @('sBncrona','s[h00ED]ncrona'), @('inBcio','in[h00ED]cio'),
  @('InBcio','In[h00ED]cio'), @('alBa','al[h00E7]a'), @('AlBa','Al[h00E7]a'),
  @('formulBrio','formul[h00E1]rio'), @('MantBm','Mant[h00E9]m'),
  @('mantBm','mant[h00E9]m'), @('SubtraBmos','Subtra[h00ED]mos'),
  @('contrBrio','contr[h00E1]rio'), @('serB','ser[h00E1]'),
  @('histBrico','hist[h00F3]rico'), @('cBlula','c[h00E9]lula'),
  @('CBlula','C[h00E9]lula'), @('sBries','s[h00E9]ries'),
  @('SB','S[h00F3]'), @('sB','s[h00F3]'), @('jB','j[h00E1]'),
  @('JB','J[h00E1]'), @('LB','L[h00E1]'), @('hB','h[h00E1]'),
  @('AlBm','Al[h00E9]m'), @('MBdia','M[h00E9]dia'), @('MBnimo','M[h00ED]nimo'),
  @('TBtulo','T[h00ED]tulo'), @('tBtulo','t[h00ED]tulo'),
  @('tBtulos','t[h00ED]tulos'), @('RBtulo','R[h00F3]tulo'),
  @('rBtulos','r[h00F3]tulos'), @('contBiner','cont[h00EA]iner'),
  @('Brf','[h00E3]rf')
)


# Build regexes: "B" matches exactly one broken marker (FFFD or "?").
$repl = [ordered]@{}
foreach ($p in $pairs) {
  $broken = $p[0] -replace 'B', '[\uFFFD?]'
  $repl[$broken] = (Fx $p[1])
}
# Build regexes: "B" matches exactly one broken marker (FFFD or "?").
# Use a case-sensitive list (PowerShell hashtables ignore case, which
# would collide e.g. "padrBo"/"PadrBo"); apply longest patterns first.
# NOTE: -creplace is required so the "B" marker is not matched case-
# insensitively against a literal "b" inside the word.
$rules = foreach ($p in $pairs) {
  [pscustomobject]@{
    Pattern = ($p[0] -creplace 'B', '[\uFFFD?]')
    Fixed   = (Fx $p[1])
  }
}
$rules = $rules | Sort-Object { $_.Pattern.Length } -Descending
foreach ($r in $rules) { $text = [regex]::Replace($text, $r.Pattern, $r.Fixed) }

# --- Final pass: words missed by the main dictionary + context-sensitive ones.
$extra = @(
  @('cabeBalho','cabe[h00E7]alho'), @('CabeBalho','Cabe[h00E7]alho'),
  @('A??es','A[h00E7][h00F5]es'), @('atribu?do','atribu[h00ED]do'),
  @('distribu?dos','distribu[h00ED]dos'), @('posi??o','posi[h00E7][h00E3]o'),
  @('Frequ?ncia','Frequ[h00EA]ncia'), @('Recorr?ncia','Recorr[h00EA]ncia'),
  @('Sele??o','Sele[h00E7][h00E3]o'), @('Subtra?mos','Subtra[h00ED]mos'),
  @('T?rmino','T[h00E9]rmino'), @('tamb?m','tamb[h00E9]m'),
  @('rec?m','rec[h00E9]m'), @('Ap?s','Ap[h00F3]s'), @('N?O','N[h00C3]O'),
  @('?Configura','"Configura'), @('tabela?','tabela"'),
  @('pr?-definida','pr[h00E9]-definida'), @('d? um','d[h00EA] um'),
  @('(a? o','(a[h00ED] o'), @('?s linhas','[h00E0]s linhas'),
  @('` ?s ','` [h00E0]s ')
)
$extraRules = foreach ($p in $extra) {
  # Escape literal regex chars, then turn the escaped "?" and "B" markers
  # into the broken-marker character class.
  $pat = [regex]::Escape($p[0]) -creplace '\\\?', '[\uFFFD?]'
  $pat = $pat -creplace 'B', '[\uFFFD?]'
  [pscustomobject]@{ Pattern = $pat; Fixed = (Fx $p[1]) }
}
foreach ($r in ($extraRules | Sort-Object { $_.Pattern.Length } -Descending)) {
  $text = [regex]::Replace($text, $r.Pattern, $r.Fixed)
}
# "ãrfão" was a bad guess for "órfão".
$text = [regex]::Replace($text, '[h00E3]rf[\uFFFD?]o', (Fx '[h00F3]rf[h00E3]o'))
# Remaining "bot?o"/"bot?es"/"l?" variants (broken marker, any case).
$text = [regex]::Replace($text, '[Bb]ot[\uFFFD?]o', (Fx 'bot[h00E3]o'))
$text = [regex]::Replace($text, '[Bb]ot[\uFFFD?]es', (Fx 'bot[h00F5]es'))
$text = [regex]::Replace($text, 'r[\uFFFD?]tulo', (Fx 'r[h00F3]tulo'))
$text = [regex]::Replace($text, 'l[\uFFFD?]\.', (Fx 'l[h00E1].'))


# Standalone broken marker between non-letters: preposition "a-acute" before
# certain nouns, otherwise the verb "e-acute".
$eu = [regex]::Escape([string]$U)
$bm = '(?:' + $eu + '|\?)'
$text = [regex]::Replace($text,
  '(?<![A-Za-z' + $eu + '?])' + $bm + ' (?=direita|esquerda|borda|lista|tabela|viewport|sidebar|p.gina)',
  (Fx '[h00E0] '))
$text = [regex]::Replace($text,
  '(?<![A-Za-z' + $eu + '?])' + $bm + '(?![A-Za-z' + $eu + '])',
  (Fx '[h00E9]'))

[System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))

$left = ([regex]::Matches($text, $U)).Count
$qw = ([regex]('[A-Za-z\u00C0-\u00FF]\?[A-Za-z\u00C0-\u00FF]')).Matches($text).Count
Write-Output "Remaining U+FFFD: $left"
Write-Output "Word-internal '?' remaining: $qw"
