"""
Conversor unificado de PIT (Plano de Inspecao e Testes - Tekpower TPS125)
para JSON canonico + lista ordenada de escritas CAN (Fase 1 -> Reboot -> Fase 2).

Formatos suportados:
  - .csv  (stdlib csv)
  - .xlsx (openpyxl se disponivel, ou leitor nativo zipfile+XML sem dependencias)
  - .docx (python-docx ou fallback zipfile+XML)
  - .pdf  (pymupdf / fitz com extracao de tabelas por grade vetorial)

Referencia de registradores: PIT_MAPEAMENTO_CAN_TPS125.md e DATAMAP.md
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple


# ============================================================================
# CONSTANTES DO PROTOCOLO CAN TPS125
# ============================================================================
EMPTY_I16 = -32768       # 0x8000
EMPTY_I32 = -2147483648  # 0x80000000

UR_SISTEMA_MAP = {
    "1P2W-127": 0,
    "1P2W-220": 1,
    "3P3W-220": 2,
    "3P4W-380": 3,
}

# P01..P19 -> (reg, nome, tipo, escala, base_pu, unidade_tempo_mult)
PARAM_CAN_MAP: Dict[str, Tuple[int, str, str, float, Optional[str], float]] = {
    "P01": (232, "REG_Vset_flu",      "int16", 0.1,   "BPU_Vcc", 1.0),
    "P02": (233, "REG_Vset_equ",      "int16", 0.1,   "BPU_Vcc", 1.0),
    "P03": (234, "REG_Vset_prof",     "int16", 0.1,   "BPU_Vcc", 1.0),
    "P04": (235, "REG_Vset_cons",     "int16", 0.1,   "BPU_Vcc", 1.0),
    "P05": (236, "REG_Vset_emerg",    "int16", 0.1,   "BPU_Vcc", 1.0),
    "P06": (237, "REG_Iset_ret",      "int16", 0.1,   "BPU_Icc", 1.0),
    "P07": (238, "REG_Iset_bat",      "int16", 0.1,   "BPU_Icc", 1.0),
    "P08": (239, "REG_Ilimiar_equ",   "int16", 0.1,   "BPU_Icc", 1.0),
    "P09": (240, "REG_Tequ_delay",    "int32", 1.0,   None,      60.0),   # min -> s
    "P10": (241, "REG_Ilimiar_flu",   "int16", 0.1,   "BPU_Icc", 1.0),
    "P11": (242, "REG_Tequ_retem",    "int32", 1.0,   None,      60.0),   # min -> s
    "P12": (243, "REG_Tequ_max",      "int32", 1.0,   None,      3600.0), # h -> s
    "P13": (404, "REG_Atu_Sens_Tbat", "int16", 1.0,   None,      1.0),
    "P14": (244, "REG_Vcomp_ref",     "int16", 0.1,   None,      1.0),
    "P15": (245, "REG_Vcomp_coef",    "int16", 0.001, "BPU_Vcc", 1.0),    # V/C -> pu/C
    "P16": (246, "REG_Vcomp_min",     "int16", 0.1,   None,      1.0),
    "P17": (248, "REG_Vset_teste",    "int16", 0.1,   "BPU_Vcc", 1.0),
    "P18": (249, "REG_Iset_teste",    "int16", 0.1,   "BPU_Icc", 1.0),
    "P19": (250, "REG_Tlvd_retorno",  "int32", 1.0,   None,      60.0),   # min -> s
}

# AL01..AL27 -> (reg_atu, atu_rw, escala_atu, reg_opt, opt_rw, reg_rele, rele_rw, nome_base)
ALARM_CAN_MAP: Dict[str, Tuple[int, bool, float, int, bool, int, bool, str]] = {
    "AL01": (378, True,  0.1,    330, True,  266, True,  "Vca_sub"),
    "AL02": (379, True,  0.1,    331, True,  267, True,  "Vca_sobre"),
    "AL03": (382, True,  0.1,    334, True,  270, True,  "Fca_sub"),
    "AL04": (383, True,  0.1,    335, True,  271, True,  "Fca_sobre"),
    "AL05": (380, False, 0.001,  332, True,  268, True,  "Vca_ffase"),
    "AL06": (384, True,  1.0,    336, True,  272, True,  "Vca_seq"),
    "AL07": (381, True,  0.1,    333, True,  269, True,  "Vca_balanc"),
    "AL08": (385, True,  0.1,    337, True,  273, True,  "Vca_dist"),
    "AL09": (409, False, 1.0,    369, False, 305, False, "CAN"),
    "AL10": (391, False, 1.0,    343, False, 279, True,  "Protecao"),
    "AL11": (401, True,  0.1,    361, True,  297, True,  "Vcons_sub"),
    "AL12": (393, True,  0.1,    353, True,  289, True,  "Vcons_sobre"),
    "AL13": (400, True,  0.1,    360, True,  296, True,  "Vret_sub"),
    "AL14": (392, True,  0.1,    352, True,  288, True,  "Vret_sobre"),
    "AL15": (402, True,  0.1,    362, True,  298, True,  "Ibat_desc"),
    "AL16": (403, True,  0.1,    363, True,  299, True,  "Vbat_fim"),
    "AL17": (394, True,  0.1,    354, True,  290, True,  "Icons_sobre"),
    "AL18": (396, False, 0.1,    356, False, 292, True,  "Ibat_fonte"),
    "AL19": (395, True,  0.1,    355, True,  291, True,  "Temp_Bat"),
    "AL20": (408, True,  0.1,    368, True,  304, True,  "Manutencao"),   # PIT em kh (0..300 kh) -> rede x0.1 kh (0..3000 int16)
    "AL21": (407, False, 1.0,    367, False, 303, True,  "Falha_UDQ"),
    "AL22": (387, True,  1.0,    339, True,  275, True,  "Reincidencia"),
    "AL23": (404, False, 1.0,    364, True,  300, True,  "Sens_Tbat"),  # Atu ja gravado em P13
    "AL24": (405, False, 1.0,    365, False, 301, True,  "EqAuto_nao"),
    "AL25": (406, False, 1.0,    366, False, 302, True,  "EqMan_nao"),
    "AL26": (410, False, 1.0,    370, True,  306, True,  "Vcons_alta"),
    "AL27": (411, True,  0.1,    371, True,  307, True,  "Cbat_baixa"),
}

# CN1..CN8 -> (reg_opt, reg_rele)
DIN_CAN_MAP: Dict[str, Tuple[int, int]] = {
    f"CN{i}": (343 + i, 279 + i) for i in range(1, 9)
}

# Status 01..22 -> (reg_rele, nome)
STATUS_RELE_CAN_MAP: Dict[str, Tuple[int, str]] = {
    "01": (264, "REG_Rele_Power_off"),
    "02": (265, "REG_Rele_Standby"),
    "03": (318, "REG_Rele_Disponivel"),
    "04": (317, "REG_Rele_Ligado"),
    "05": (319, "REG_Rele_Auto"),
    "06": (320, "REG_Rele_Manual"),
    "07": (322, "REG_Rele_Equa"),
    "08": (323, "REG_Rele_Flut"),
    "09": (324, "REG_Rele_UDQ_ativa"),
    "10": (321, "REG_Rele_Inibida"),
    "11": (325, "REG_Rele_Remoto"),
    "12": (326, "REG_Rele_Teste_Bat"),
    "13": (312, "REG_Rele_UR_manual_mode"),
    "14": (274, "REG_Rele_UR_perda"),
    "15": (314, "REG_Rele_UR_module_fault"),
    "16": (315, "REG_Rele_UR_over_temperature"),
    "17": (316, "REG_Rele_UR_power_on"),
    "18": (309, "REG_Rele_UR_ausente"),
    "19": (310, "REG_Rele_UR_subtensao"),
    "20": (311, "REG_Rele_UR_sobretensao"),
    "21": (276, "REG_Rele_UR_Iret_lim"),
    "22": (327, "REG_Rele_Teste"),
}

SINOTICO_LED_MAP = {
    "NENHUM": 0,
    "AC,ALM": 1, "CA,ALM": 1,
    "AC,FLT": 1 | 8, "CA,FLT": 1 | 8,
    "RET,ALM": 2,
    "RET,FLT": 2 | 8,
    "BAT,ALM": 3,
    "BAT,FLT": 3 | 8,
    "CON,ALM": 4,
    "CON,FLT": 4 | 8,
}

DIN_COMANDO_MAP = {
    "NENHUM": 0,
    "INIBIR": 1,
    "REMOTO": 2,
    "DESLIGA": 3,
    "RESET": 4,
    "CARG.MAN": 5,
    "EQUAL.": 6,
    "EMG.UDQ": 17,
    "STD_BY": 18,
    "DJ_CA": 19,
    "DJCA_DES": 19,
    "DJB_DES": 20,
    "DJC_DES": 21,
}


# ============================================================================
# UTILITARIOS DE NORMALIZACAO E CONVERSAO
# ============================================================================
def _norm(text: str) -> str:
    """Remove acentos, colapsa espacos e converte para maiusculas."""
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().upper()


def _parse_float(val: str) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.upper() in ("-", "---", "N/A", "NAN", "NONE"):
        return None
    s = s.replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    return round(float(m.group(0)), 6)


def _parse_int(val: str) -> Optional[int]:
    f = _parse_float(val)
    return int(round(f)) if f is not None else None


def _parse_retardo_s(val: str) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().lower()
    if not s or s in ("-", "---", "n/a", "nan"):
        return None
    num = _parse_float(s)
    if num is None:
        return None
    if "min" in s:
        return round(num * 60.0, 2)
    if "h" in s:
        return round(num * 3600.0, 2)
    return round(num, 2)


def _pack_reles(rp1=0, rp2=0, re11=0, re12=0, re21=0, re22=0) -> int:
    """Empacota 6 slots de rele (5 bits cada) em tuReles (int32)."""
    return (
        ((int(rp1 or 0) & 0x1F) << 0)
        | ((int(rp2 or 0) & 0x1F) << 5)
        | ((int(re11 or 0) & 0x1F) << 10)
        | ((int(re12 or 0) & 0x1F) << 15)
        | ((int(re21 or 0) & 0x1F) << 20)
        | ((int(re22 or 0) & 0x1F) << 25)
    )


def _pack_reles_fixos(entrada=0, precarga=0, stand_by=0, udq1=0, udq2=0, udq3=0, lvd=0) -> int:
    """Empacota tuRelesFixos (int32, campos signed 4-bit)."""
    def _s4(v: int) -> int:
        return int(v or 0) & 0xF
    return (
        (_s4(entrada) << 0)
        | (_s4(precarga) << 4)
        | (_s4(stand_by) << 8)
        | (_s4(udq1) << 12)
        | (_s4(udq2) << 16)
        | (_s4(udq3) << 20)
        | (_s4(lvd) << 24)
    )


def _pack_acao(acao_str: str) -> int:
    s = _norm(acao_str).replace(" ", "")
    if not s or s == "NENHUM":
        return 0
    bits = 0
    if "ALM" in s:
        bits |= 1 << 0
    if "RT" in s:
        bits |= 1 << 1
    if "BLQ" in s or "BL" in s:
        bits |= 1 << 2
        bits |= 1 << 0  # firmware forca ALM quando BLQ=1
    return bits


def _pack_alarme_options(
    retardo_s: Optional[float],
    acao_str: str,
    sinotico: str = "NENHUM",
    comando: str = "NENHUM",
    tipo_din: Optional[str] = None,
) -> int:
    """Empacota tuAlarmeOptions (int32)."""
    ret_deci = int(round((retardo_s or 0.0) * 10)) & 0xFFFF
    acao = _pack_acao(acao_str) & 0xF
    led = SINOTICO_LED_MAP.get(_norm(sinotico).replace(" ", ""), 0) & 0xF
    cmd = DIN_COMANDO_MAP.get(_norm(comando).replace(" ", ""), 0) & 0x1F
    invert = 0
    enable = 0
    if tipo_din is not None:
        t = _norm(tipo_din)
        if t == "NA":
            enable = 1
            invert = 0
        elif t == "NF":
            enable = 1
            invert = 1
        else:  # DESL
            enable = 0
            invert = 0
    return (
        (ret_deci << 0)
        | (acao << 16)
        | (led << 20)
        | (cmd << 24)
        | (invert << 29)
        | (enable << 30)
    )


def _pack_sensor_int(tipo: int, valor: int = 0) -> int:
    """
    tuParamSensorInt (extraido do DWARF de burnin.out):
      bits [15:0]  = valor (16 bits)
      bits [23:16] = rsvd  (8 bits)
      bits [30:24] = tipo  (7 bits)
      bit  [31]    = empty (1 bit)
    """
    return ((valor & 0xFFFF) << 0) | ((tipo & 0x7F) << 24)


def _pack_sensor_ext(tipo: int, valor1: int = 0, valor2: int = 0) -> int:
    """
    tuParamSensorExt (extraido do DWARF de burnin.out):
      bits [15:0]  = valor1 (16 bits - corrente em 0.1 A ou tensao TP em 0.1 V)
      bits [23:16] = valor2 (8 bits  - espiras do TC, 1..9)
      bits [30:24] = tipo   (7 bits)
      bit  [31]    = empty  (1 bit)
    """
    return ((valor1 & 0xFFFF) << 0) | ((valor2 & 0xFF) << 16) | ((tipo & 0x7F) << 24)


# ============================================================================
# EXTRATORES POR FORMATO -> MATRIZ UNIFICADA List[List[str]]
# ============================================================================
def extract_rows_csv(path: str) -> List[List[str]]:
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin1", errors="replace")

    sample = text[:4096]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    return [[c.strip() for c in row] for row in reader]


def extract_rows_xlsx(path: str) -> List[List[str]]:
    try:
        import openpyxl  # type: ignore
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(["" if v is None else str(v).strip() for v in row])
        return rows
    except ImportError:
        pass

    # Fallback nativo sem dependencias externas (zipfile + ElementTree)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path, "r") as zf:
        shared: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("x:si", ns):
                txt = "".join(t.text or "" for t in si.findall(".//x:t", ns))
                shared.append(txt)

        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in zf.namelist():
            sheets = sorted(n for n in zf.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
            if not sheets:
                raise ValueError("Nenhuma aba encontrada no arquivo .xlsx")
            sheet_name = sheets[0]

        sroot = ET.fromstring(zf.read(sheet_name))
        rows: List[List[str]] = []

        def col_to_idx(ref: str) -> int:
            letters = "".join(ch for ch in ref if ch.isalpha())
            idx = 0
            for ch in letters.upper():
                idx = idx * 26 + (ord(ch) - ord("A") + 1)
            return idx - 1

        for row_el in sroot.findall(".//x:sheetData/x:row", ns):
            cells: Dict[int, str] = {}
            max_c = -1
            for c_el in row_el.findall("x:c", ns):
                ref = c_el.attrib.get("r", "")
                cidx = col_to_idx(ref) if ref else (max_c + 1)
                ctype = c_el.attrib.get("t", "")
                val = ""
                if ctype == "s":
                    v_el = c_el.find("x:v", ns)
                    if v_el is not None and v_el.text is not None:
                        val = shared[int(v_el.text)]
                elif ctype == "inlineStr":
                    val = "".join(t.text or "" for t in c_el.findall(".//x:t", ns))
                else:
                    v_el = c_el.find("x:v", ns)
                    if v_el is not None and v_el.text is not None:
                        val = v_el.text
                cells[cidx] = val.strip()
                if cidx > max_c:
                    max_c = cidx
            if max_c >= 0:
                rows.append([cells.get(i, "") for i in range(max_c + 1)])
            else:
                rows.append([])
        return rows


def extract_rows_docx(path: str) -> List[List[str]]:
    rows: List[List[str]] = []
    try:
        import docx  # type: ignore
        from docx.oxml.table import CT_Tbl  # type: ignore
        from docx.oxml.text.paragraph import CT_P  # type: ignore
        from docx.table import Table  # type: ignore
        from docx.text.paragraph import Paragraph  # type: ignore

        doc = docx.Document(path)
        for child in doc.element.body.iterchildren():
            if isinstance(child, CT_P):
                txt = Paragraph(child, doc).text.strip()
                if txt:
                    rows.append([txt])
            elif isinstance(child, CT_Tbl):
                tbl = Table(child, doc)
                for tr in tbl.rows:
                    rows.append([c.text.replace("\n", " ").strip() for c in tr.cells])
        return rows
    except ImportError:
        pass

    # Fallback nativo XML
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path, "r") as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
        body = root.find("w:body", ns)
        if body is None:
            return rows
        for child in body:
            tag = child.tag.split("}")[-1]
            if tag == "p":
                txt = "".join(t.text or "" for t in child.findall(".//w:t", ns)).strip()
                if txt:
                    rows.append([txt])
            elif tag == "tbl":
                for tr in child.findall("w:tr", ns):
                    r = []
                    for tc in tr.findall("w:tc", ns):
                        txt = " ".join(
                            "".join(t.text or "" for t in p.findall(".//w:t", ns)).strip()
                            for p in tc.findall("w:p", ns)
                        ).strip()
                        r.append(txt)
                    rows.append(r)
    return rows


def extract_rows_pdf(path: str) -> List[List[str]]:
    """
    Extrator geometrico rapido e deterministico usando coordenadas (x, y) das palavras
    e retangulos da grade vetorial, imune a bugs de page.find_tables() no PyMuPDF 2.x.
    """
    import pymupdf  # type: ignore

    doc = pymupdf.open(path)
    rows: List[List[str]] = []

    for page in doc:
        words = page.get_text("words")  # (x0, y0, x1, y1, text, block, line, word_no)
        if not words:
            continue

        # Extrai todos os segmentos verticais de borda (linhas 'l' e retangulos 're') abaixo do cabecalho
        v_segs: List[Tuple[float, float, float]] = []  # (x, y0, y1)
        for d in page.get_drawings():
            for item in d.get("items", []):
                kind = item[0]
                if kind == "re":
                    r = item[1]
                    if r.y1 > 55 and (r.y1 - r.y0) >= 6 and (r.x1 - r.x0) < 560:
                        v_segs.append((r.x0, r.y0, r.y1))
                        v_segs.append((r.x1, r.y0, r.y1))
                elif kind == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.x - p2.x) <= 1.5 and max(p1.y, p2.y) > 55 and abs(p2.y - p1.y) >= 6:
                        v_segs.append(((p1.x + p2.x) * 0.5, min(p1.y, p2.y), max(p1.y, p2.y)))

        # Agrupa palavras em linhas visuais por coordenada vertical central (yc)
        words_sorted = sorted(words, key=lambda w: ((w[1] + w[3]) * 0.5, w[0]))
        line_groups: List[List[Any]] = []
        for w in words_sorted:
            yc = (w[1] + w[3]) * 0.5
            if line_groups:
                prev_yc = sum((pw[1] + pw[3]) * 0.5 for pw in line_groups[-1]) / len(line_groups[-1])
                if abs(yc - prev_yc) <= 4.5:
                    line_groups[-1].append(w)
                    continue
            line_groups.append([w])

        for lg in line_groups:
            lg.sort(key=lambda w: w[0])
            row_yc = sum((w[1] + w[3]) * 0.5 for w in lg) / len(lg)

            # Bordas verticais que cruzam esta linha (yc)
            local_edges_raw = [round(x, 1) for (x, y0, y1) in v_segs if (y0 - 2.5) <= row_yc <= (y1 + 2.5)]
            x_edges: List[float] = []
            for x in sorted(local_edges_raw):
                if not x_edges or abs(x - x_edges[-1]) > 3.0:
                    x_edges.append(x)

            if len(x_edges) >= 4:
                ncols = len(x_edges) - 1
                cells = [""] * ncols
                for w in lg:
                    xc = (w[0] + w[2]) * 0.5
                    col_idx = 0
                    for ci in range(ncols):
                        if x_edges[ci] - 2.0 <= xc <= x_edges[ci + 1] + 2.0:
                            col_idx = ci
                            break
                        if xc > x_edges[ci + 1]:
                            col_idx = ci
                    cells[col_idx] = (cells[col_idx] + " " + w[4]).strip() if cells[col_idx] else w[4]
                if any(cells):
                    rows.append(cells)
            else:
                cells_simple: List[str] = []
                cur = lg[0][4]
                prev_x1 = lg[0][2]
                for w in lg[1:]:
                    if w[0] - prev_x1 < 8.0:
                        cur += " " + w[4]
                    else:
                        cells_simple.append(cur.strip())
                        cur = w[4]
                    prev_x1 = w[2]
                cells_simple.append(cur.strip())
                rows.append(cells_simple)

    return rows


def extract_rows(path: str) -> Tuple[str, List[List[str]]]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        return "csv", extract_rows_csv(path)
    if ext in (".xlsx", ".xlsm"):
        return "xlsx", extract_rows_xlsx(path)
    if ext == ".docx":
        return "docx", extract_rows_docx(path)
    if ext == ".pdf":
        return "pdf", extract_rows_pdf(path)
    raise ValueError(f"Formato de arquivo nao suportado: {ext}")


# ============================================================================
# PARSER SEMANTICO UNIFICADO (INDEPENDENTE DO FORMATO DE ORIGEM)
# ============================================================================
def _non_empty(row: List[str]) -> List[Tuple[int, str]]:
    return [(i, c.strip()) for i, c in enumerate(row) if c and c.strip()]


def _extract_relay_slots(
    row: List[str],
    col_p: Optional[int],
    col_e1: Optional[int],
    col_e2: Optional[int],
) -> Dict[str, int]:
    """Extrai os 6 slots (rp1, rp2, re11, re12, re21, re22) baseado nos indices do cabecalho."""
    def get_pair(start: Optional[int], end: Optional[int]) -> Tuple[int, int]:
        if start is None:
            return 0, 0
        stop = end if end is not None else min(len(row), start + 2)
        vals: List[int] = []
        for idx in range(start, min(stop, len(row))):
            v = _parse_int(row[idx])
            if v is not None and v > 0:
                vals.append(v)
        v1 = vals[0] if len(vals) >= 1 else 0
        v2 = vals[1] if len(vals) >= 2 else 0
        return v1, v2

    rp1, rp2 = get_pair(col_p, col_e1)
    re11, re12 = get_pair(col_e1, col_e2)
    re21, re22 = get_pair(col_e2, (col_e2 + 2) if col_e2 is not None else None)
    return {
        "rp1": rp1, "rp2": rp2,
        "re11": re11, "re12": re12,
        "re21": re21, "re22": re22,
    }


def _find_relay_header_cols(row: List[str]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    col_p = col_e1 = col_e2 = None
    for idx, cell in enumerate(row):
        n = _norm(cell)
        if n.startswith("PRINCIP"):
            col_p = idx
        elif n in ("EXP. 1", "EXP.1", "EXP 1"):
            col_e1 = idx
        elif n in ("EXP. 2", "EXP.2", "EXP 2"):
            col_e2 = idx
    return col_p, col_e1, col_e2


def parse_pit_rows(rows: List[List[str]]) -> Dict[str, Any]:
    pit: Dict[str, Any] = {
        "meta": {},
        "base": {},
        "calibracao": {},
        "limites_parametros": {},
        "limites_alarmes": {},
        "mostradores": {},
        "parametros": {},
        "alarmes": {},
        "entradas_digitais": {},
        "saidas_rele": {},
    }

    section = ""
    subsection = ""
    relay_cols: Tuple[Optional[int], Optional[int], Optional[int]] = (None, None, None)

    i = 0
    while i < len(rows):
        row = rows[i]
        ne = _non_empty(row)
        if not ne:
            i += 1
            continue

        joined = " ".join(v for _, v in ne)
        nj = _norm(joined)

        # Ignora tabelas auxiliares de validacao de dados no rodape do CSV/Excel
        if nj.startswith("ENTRADA CA RELES FIXOS") or nj.startswith("SISTEMA NO RELE"):
            break

        # Documento nº
        if "DOCUMENTO N" in nj:
            m = re.search(r"DOCUMENTO\s*N[º°O]?\.?\s*:?\s*(.+)", joined, re.IGNORECASE)
            if m:
                doc_val = m.group(1).strip()
                if doc_val.upper() not in ("NAN", ""):
                    pit["meta"]["documento"] = doc_val
            i += 1
            continue

        # Deteccao de secoes principais e subsecoes
        if re.match(r"^1\.\s*DADOS\b", nj):
            section, subsection = "1", ""
            i += 1
            continue
        if re.match(r"^2\.\s*PARAMETROS BASE\b", nj):
            section, subsection = "2", ""
            i += 1
            continue
        if re.match(r"^2\.\s*1\b", nj):
            section, subsection = "2", "2.1"
            i += 1
            continue
        if re.match(r"^2\.\s*2\b", nj):
            section, subsection = "2", "2.2"
            i += 1
            continue
        if re.match(r"^2\.\s*3\b", nj):
            section, subsection = "2", "2.3"
            i += 1
            continue
        if re.match(r"^2\.\s*4\b", nj):
            section, subsection = "2", "2.4"
            i += 1
            continue
        if re.match(r"^2\.\s*5\b", nj):
            section, subsection = "2", "2.5"
            i += 1
            continue
        if re.match(r"^2\.\s*6\b", nj):
            section, subsection = "2", "2.6"
            i += 1
            continue
        if re.match(r"^2\.\s*7\b", nj):
            section, subsection = "2", "2.7"
            i += 1
            continue
        if re.match(r"^2\.\s*8\b", nj):
            section, subsection = "2", "2.8"
            i += 1
            continue
        if re.match(r"^2\.\s*9\b", nj):
            section, subsection = "2", "2.9"
            i += 1
            continue
        if re.match(r"^3\.\s*CALIBRACAO\b", nj):
            section, subsection = "3", ""
            i += 1
            continue
        if re.match(r"^3\.\s*7\b", nj) or "HORIMETRO" in nj:
            section, subsection = "3", "3.7"
            i += 1
            continue
        if re.match(r"^4\.\s*1\b", nj):
            section, subsection = "4", "4.1"
            i += 1
            continue
        if re.match(r"^4\.\s*2\b", nj):
            section, subsection = "4", "4.2"
            i += 1
            continue
        if re.match(r"^5\.\s*MOSTRADORES\b", nj):
            section, subsection = "5", ""
            i += 1
            continue
        if re.match(r"^6\.\s*1\b", nj):
            section, subsection = "6", "6.1"
            i += 1
            continue
        if re.match(r"^6\.\s*2\b", nj):
            section, subsection = "6", "6.2"
            relay_cols = (None, None, None)
            i += 1
            continue
        if re.match(r"^6\.\s*3\b", nj):
            section, subsection = "6", "6.3"
            relay_cols = (None, None, None)
            i += 1
            continue
        if re.match(r"^6\.\s*4\b", nj):
            section, subsection = "6", "6.4"
            relay_cols = (None, None, None)
            i += 1
            continue

        # ---------------- SECAO 1: METADADOS ----------------
        if section == "1":
            if "CLIENTE" in nj and "MODELO EQUIPAMENTO" in nj and i + 1 < len(rows):
                hdr_cols = [(idx, _norm(v)) for idx, v in ne]
                val_row = rows[i + 1]
                ne_val = _non_empty(val_row)
                pairs = list(zip([h for _, h in hdr_cols], [v for _, v in ne_val])) if len(ne_val) == len(hdr_cols) else [
                    (hname, val_row[idx].strip() if idx < len(val_row) else "") for idx, hname in hdr_cols
                ]
                for hname, val in pairs:
                    if "CLIENTE" in hname:
                        pit["meta"]["cliente"] = val
                    elif "MODELO" in hname:
                        pit["meta"]["modelo"] = val
                    elif "SERIE" in hname:
                        pit["meta"]["numero_serie"] = val
                    elif "PROJETO" in hname:
                        pit["meta"]["projeto"] = val
                i += 2
                continue
            if "ORDEM COMPRA" in nj and i + 1 < len(rows):
                hdr_cols = [(idx, _norm(v)) for idx, v in ne]
                val_row = rows[i + 1]
                for idx, hname in hdr_cols:
                    val = val_row[idx].strip() if idx < len(val_row) else ""
                    if "LICITACAO" in hname:
                        pit["meta"]["licitacao"] = val
                    elif "ORDEM COMPRA" in hname:
                        pit["meta"]["ordem_compra"] = val
                    elif "ESPECIFICACAO" in hname:
                        pit["meta"]["especificacao_tecnica"] = val
                    elif "INSTALACAO" in hname:
                        pit["meta"]["area_instalacao"] = val
                i += 2
                continue
            if "PEDIDO DE VENDA" in nj and i + 1 < len(rows):
                hdr_cols = [(idx, _norm(v)) for idx, v in ne]
                val_row = rows[i + 1]
                for idx, hname in hdr_cols:
                    val = val_row[idx].strip() if idx < len(val_row) else ""
                    if "PEDIDO" in hname:
                        pit["meta"]["pedido_venda"] = val
                    elif "PRODUCAO" in hname:
                        pit["meta"]["ordem_producao"] = val
                i += 2
                continue

        # ---------------- SECAO 2: PARAMETROS BASE ----------------
        if section == "2":
            # Helper: extrai valor numerico ou string de uma linha "ROTULO ... VALOR [UNIDADE]"
            compact = _norm("".join(v for _, v in ne)).replace(" ", "")
            vals_tokens = [v for _, v in ne]

            def last_val_before_unit() -> str:
                units = {"V", "A", "%", "MODULOS", "VOLTAS", "NO RELE", "N RELE", "UND"}
                filtered = [t for t in vals_tokens if _norm(t) not in units and t not in (":", ".:")]
                return filtered[-1] if filtered else ""

            if subsection == "2.1":
                if "TENS.NOM" in compact:
                    pit["base"]["vcc_nom"] = _parse_float(last_val_before_unit())
                elif "CORR.NOM" in compact:
                    pit["base"]["icc_nom"] = _parse_float(last_val_before_unit())
                elif "TENS.MAX" in compact:
                    pit["base"]["vcc_max_pct"] = _parse_float(last_val_before_unit())
                elif "CORR.MAX" in compact:
                    pit["base"]["icc_max_pct"] = _parse_float(last_val_before_unit())
                elif "TENS.EME" in compact:
                    pit["base"]["ur_vcc_eme"] = _parse_float(last_val_before_unit())
            elif subsection == "2.2":
                if "N.URS" in compact:
                    pit["base"]["ur_quantidade"] = _parse_int(last_val_before_unit())
            elif subsection == "2.3":
                if "TENS.NOM" in compact:
                    pit["base"]["vca_nom"] = _parse_float(last_val_before_unit())
                elif "SISTEMA" in compact:
                    pit["base"]["ur_sistema"] = last_val_before_unit().upper()
            elif subsection == "2.4":
                if "TIPO" in compact:
                    pit["base"]["sensor_ica_tipo"] = last_val_before_unit()
                elif "ESPIRAS" in compact:
                    pit["base"]["sensor_ica_espiras"] = _parse_int(last_val_before_unit())
                elif "TC:" in compact or compact.startswith("TC"):
                    pit["base"]["sensor_ica_tc_a"] = _parse_float(last_val_before_unit())
            elif subsection == "2.5":
                if "TIPO" in compact:
                    pit["base"]["sensor_iret_tipo"] = last_val_before_unit()
                elif "SHUNT" in compact:
                    pit["base"]["sensor_iret_shunt_a"] = _parse_float(last_val_before_unit())
            elif subsection == "2.6":
                if "TIPO" in compact:
                    pit["base"]["sensor_ibat_tipo"] = last_val_before_unit()
                elif "SHUNT" in compact:
                    pit["base"]["sensor_ibat_shunt_a"] = _parse_float(last_val_before_unit())
            elif subsection == "2.7":
                rf = pit["base"].setdefault("reles_fixos", {})
                if "DESCONEXAOCA" in compact:
                    rf["desconexao_ca"] = _parse_int(last_val_before_unit()) or 0
                elif "UDQESTAGIO1" in compact:
                    rf["udq_estagio_1"] = _parse_int(last_val_before_unit()) or 0
                elif "UDQESTAGIO2" in compact:
                    rf["udq_estagio_2"] = _parse_int(last_val_before_unit()) or 0
                elif "UDQESTAGIO3" in compact:
                    rf["udq_estagio_3"] = _parse_int(last_val_before_unit()) or 0
                elif "DESCONEXAOCC" in compact:
                    rf["desconexao_cc"] = _parse_int(last_val_before_unit()) or 0
            elif subsection == "2.8":
                if "DIODOSUDQ" in compact:
                    pit["base"]["udq_diodos"] = _parse_int(last_val_before_unit())
                elif "D.BLOQUEIO" in compact:
                    pit["base"]["udq_diodo_bloqueio"] = _parse_int(last_val_before_unit()) or 0
            elif subsection == "2.9":
                if "SERIE" in compact:
                    pit["base"]["sn_equip"] = _parse_int(last_val_before_unit())

        # ---------------- SECAO 3.7: HORIMETRO ----------------
        if subsection == "3.7":
            vals = [v for _, v in ne]
            if len(vals) >= 2:
                k = _norm(vals[0])
                if "HORAS" in k:
                    v = _parse_int(vals[-1])
                    pit["base"]["horimetro_horas"] = v if v is not None else 0
                elif "CICLOS" in k:
                    v = _parse_int(vals[-1])
                    pit["base"]["horimetro_ciclos"] = v if v is not None else 0

        # ---------------- SECAO 4.1: LIMITES DE PARAMETROS ----------------
        if subsection == "4.1":
            code = ne[0][1].strip().upper()
            if re.match(r"^P\d{2}$", code) and len(ne) >= 4:
                # [code, desc, max, min, unidade]
                pit["limites_parametros"][code] = {
                    "descricao": ne[1][1],
                    "max": _parse_float(ne[-3][1]),
                    "min": _parse_float(ne[-2][1]),
                    "unidade": ne[-1][1],
                }

        # ---------------- SECAO 4.2: LIMITES DE ALARMES ----------------
        if subsection == "4.2":
            code = ne[0][1].strip().upper()
            if re.match(r"^AL\d{2}$", code) and len(ne) >= 5:
                # [code, desc, acao, max, min, unidade]
                pit["limites_alarmes"][code] = {
                    "descricao": ne[1][1],
                    "acao": ne[-4][1].replace(" ", ""),
                    "max": _parse_float(ne[-3][1]),
                    "min": _parse_float(ne[-2][1]),
                    "unidade": ne[-1][1],
                }

        # ---------------- SECAO 5: MOSTRADORES ----------------
        if section == "5":
            vals = [v for _, v in ne]
            if len(vals) >= 2:
                k = _norm(vals[0])
                if "TENSAO CC" in k:
                    pit["mostradores"]["digitos_vcc"] = _parse_int(vals[-1])
                elif "CORRENTE CC" in k:
                    pit["mostradores"]["digitos_icc"] = _parse_int(vals[-1])
                elif "SEQUENCIA" in k:
                    pit["mostradores"]["sequencia_tela"] = vals[-1]
                elif "VINCULO" in k:
                    pit["mostradores"]["vinculo"] = vals[-1]
                elif "TESTE DE BATERIA" in k:
                    pit["mostradores"]["teste_bateria"] = vals[-1]

        # ---------------- SECAO 6.1: PARAMETROS DE USUARIO ----------------
        if subsection == "6.1":
            code = ne[0][1].strip().upper()
            if re.match(r"^P\d{2}$", code) and len(ne) >= 4:
                raw_val = ne[-2][1]
                pit["parametros"][code] = {
                    "descricao": ne[1][1],
                    "valor": _parse_float(raw_val),
                    "raw": raw_val,
                    "unidade": ne[-1][1],
                }

        # ---------------- SECAO 6.2: ALARMES ----------------
        if subsection == "6.2":
            if "ALARME" in nj and "PRINCIP" in nj:
                relay_cols = _find_relay_header_cols(row)
                i += 1
                continue
            code = ne[0][1].strip().upper()
            if re.match(r"^AL\d{2}$", code):
                col_p, col_e1, col_e2 = relay_cols
                # Campos antes de PRINCIP.
                pre = [(idx, v) for idx, v in ne if col_p is None or idx < col_p]
                # Esperado: [code, desc, valor, unidade, retardo]
                valor_raw = pre[2][1] if len(pre) >= 3 else ""
                unidade = pre[3][1] if len(pre) >= 4 else ""
                retardo_raw = pre[4][1] if len(pre) >= 5 else ""
                acao = pit["limites_alarmes"].get(code, {}).get("acao", "ALM")
                pit["alarmes"][code] = {
                    "descricao": pre[1][1] if len(pre) >= 2 else "",
                    "valor": _parse_float(valor_raw),
                    "raw": valor_raw,
                    "unidade": unidade,
                    "retardo_s": _parse_retardo_s(retardo_raw),
                    "retardo_raw": retardo_raw,
                    "acao": acao,
                    "reles": _extract_relay_slots(row, col_p, col_e1, col_e2),
                }

        # ---------------- SECAO 6.3: ENTRADAS DIGITAIS ----------------
        if subsection == "6.3":
            if "ENTRADA" in nj and "PRINCIP" in nj:
                relay_cols = _find_relay_header_cols(row)
                i += 1
                continue
            code = ne[0][1].strip().upper()
            if re.match(r"^CN\d+$", code):
                col_p, col_e1, col_e2 = relay_cols
                pre = [(idx, v) for idx, v in ne if col_p is None or idx < col_p]
                # Esperado: [code, desc, sinotico, tipo, retardo, acao, comando]
                pit["entradas_digitais"][code] = {
                    "descricao": pre[1][1] if len(pre) >= 2 else "",
                    "sinotico": pre[2][1] if len(pre) >= 3 else "NENHUM",
                    "tipo": pre[3][1] if len(pre) >= 4 else "DESL",
                    "retardo_s": _parse_retardo_s(pre[4][1]) if len(pre) >= 5 else 0.0,
                    "acao": pre[5][1] if len(pre) >= 6 else "NENHUM",
                    "comando": pre[6][1] if len(pre) >= 7 else "NENHUM",
                    "reles": _extract_relay_slots(row, col_p, col_e1, col_e2),
                }

        # ---------------- SECAO 6.4: SAIDAS RELE ----------------
        if subsection == "6.4":
            if "STATUS" in nj and "PRINCIP" in nj:
                relay_cols = _find_relay_header_cols(row)
                i += 1
                continue
            code = ne[0][1].strip()
            if re.match(r"^\d{2}$", code):
                col_p, col_e1, col_e2 = relay_cols
                pit["saidas_rele"][code] = {
                    "descricao": ne[1][1] if len(ne) >= 2 else "",
                    "reles": _extract_relay_slots(row, col_p, col_e1, col_e2),
                }

        i += 1

    return pit


# ============================================================================
# VALIDADOR DE CONSISTENCIA DO PIT
# ============================================================================
def validate_pit(pit: Dict[str, Any]) -> List[Dict[str, str]]:
    warnings: List[Dict[str, str]] = []
    meta = pit["meta"]
    base = pit["base"]

    # 1. Consistencia de Numero de Serie
    sn_meta = _parse_int(meta.get("numero_serie", ""))
    sn_base = base.get("sn_equip")
    if sn_meta and sn_base and sn_meta != sn_base:
        warnings.append({
            "severity": "error",
            "code": "SN_MISMATCH",
            "message": f"Numero de serie divergente: Secao 1 = {sn_meta} vs Secao 2.9 = {sn_base}.",
        })

    # 2. Campos base obrigatorios
    for req in ("vcc_nom", "icc_nom", "vcc_max_pct", "icc_max_pct", "ur_quantidade", "vca_nom", "ur_sistema"):
        if base.get(req) is None:
            warnings.append({
                "severity": "error",
                "code": "BASE_MISSING",
                "message": f"Parametro base obrigatorio ausente: {req}.",
            })

    # 3. P01..P19 contra limites da Secao 4.1
    for code, p in pit["parametros"].items():
        val = p.get("valor")
        lim = pit["limites_parametros"].get(code)
        if val is not None and lim:
            lo, hi = lim.get("min"), lim.get("max")
            if lo is not None and val < lo - 1e-6:
                warnings.append({
                    "severity": "error",
                    "code": "PARAM_OUT_OF_RANGE",
                    "message": f"{code} ({p['descricao']}) = {val} abaixo do minimo {lo} {p['unidade']}.",
                })
            if hi is not None and val > hi + 1e-6:
                warnings.append({
                    "severity": "error",
                    "code": "PARAM_OUT_OF_RANGE",
                    "message": f"{code} ({p['descricao']}) = {val} acima do maximo {hi} {p['unidade']}.",
                })

    # 4. Flutuacao == Equalizacao
    p01 = pit["parametros"].get("P01", {}).get("valor")
    p02 = pit["parametros"].get("P02", {}).get("valor")
    if p01 is not None and p02 is not None and abs(p01 - p02) < 1e-6:
        warnings.append({
            "severity": "info",
            "code": "FLU_EQ_EQUAL",
            "message": f"P01 (Flutuacao) e P02 (Equalizacao) estao iguais ({p01} V).",
        })

    # 5. AL01..AL27 contra limites da Secao 4.2
    for code, al in pit["alarmes"].items():
        val = al.get("valor")
        lim = pit["limites_alarmes"].get(code)
        if val is not None and lim:
            lo, hi = lim.get("min"), lim.get("max")
            if lo is not None and val < lo - 1e-6:
                warnings.append({
                    "severity": "error",
                    "code": "ALARM_OUT_OF_RANGE",
                    "message": f"{code} ({al['descricao']}) = {val} abaixo do minimo {lo} {al['unidade']} (Secao 4.2).",
                })
            if hi is not None and val > hi + 1e-6:
                warnings.append({
                    "severity": "error",
                    "code": "ALARM_OUT_OF_RANGE",
                    "message": f"{code} ({al['descricao']}) = {val} acima do maximo {hi} {al['unidade']} (Secao 4.2).",
                })

    # 6. Verificar relatorio de alocacao de reles (detectar colisoes entre grupos distintos)
    relay_usage: Dict[str, List[str]] = {}
    def reg_relay(src: str, rdict: Dict[str, int]):
        for slot, num in rdict.items():
            if num:
                board = "PRINCIP" if slot.startswith("rp") else ("EXP1" if slot.startswith("re1") else "EXP2")
                key = f"{board}.R{num}"
                relay_usage.setdefault(key, []).append(src)

    for code, al in pit["alarmes"].items():
        reg_relay(code, al["reles"])
    for code, din in pit["entradas_digitais"].items():
        reg_relay(code, din["reles"])
    for code, st in pit["saidas_rele"].items():
        reg_relay(f"ST{code}", st["reles"])

    for rkey, sources in sorted(relay_usage.items()):
        # Agrupamento entre alarmes CA (AL01-AL08) ou tensoes CC (AL11-AL14/AL18) ou CN1/CN2 e comum;
        # mas misturar STATUS com ALARME/CN no mesmo rele e suspeito!
        has_status = any(s.startswith("ST") for s in sources)
        has_non_status = any(not s.startswith("ST") for s in sources)
        if has_status and has_non_status:
            warnings.append({
                "severity": "warning",
                "code": "RELAY_CONFLICT",
                "message": f"Rele {rkey} compartilhado entre Status e Alarme/Entrada: {', '.join(sources)}.",
            })

    return warnings


# ============================================================================
# GERADOR DE SEQUENCIA CAN (FASE 1 -> REBOOT -> FASE 2)
# ============================================================================
def build_can_writes(pit: Dict[str, Any]) -> Dict[str, Any]:
    base = pit["base"]
    vcc_nom = base.get("vcc_nom") or 125.0
    phase1: List[Dict[str, Any]] = []
    phase2: List[Dict[str, Any]] = []

    def add(target: List[Dict[str, Any]], reg: int, name: str, fmt: str, value: int, source: str):
        target.append({
            "reg": reg,
            "name": name,
            "type": fmt,
            "value": int(value),
            "source": source,
        })

    # ---------- FASE 1: Horimetro (3.7) + SEC_Base + SEC_Sens_Int + SEC_Sens_Ext ----------
    # Zera (ou aplica valor do PIT) horas e ciclos no horimetro
    horas_set = base.get("horimetro_horas")
    ciclos_set = base.get("horimetro_ciclos")
    add(phase1, 130, "REG_Horas_set", "int32", 0 if horas_set is None else horas_set, "3.7")
    add(phase1, 131, "REG_Ciclos_set", "int16", 0 if ciclos_set is None else ciclos_set, "3.7")

    if base.get("sn_equip") is not None:
        add(phase1, 160, "REG_SN_Equip", "int32", base["sn_equip"], "2.9")
    if base.get("vcc_nom") is not None:
        add(phase1, 161, "REG_Vcc_nom", "int16", round(base["vcc_nom"] * 10), "2.1")
    if base.get("vcc_max_pct") is not None:
        add(phase1, 162, "REG_Vcc_max", "int16", round((base["vcc_max_pct"] / 100.0) * 1000), "2.1")
    if base.get("icc_nom") is not None:
        add(phase1, 163, "REG_Icc_nom", "int16", round(base["icc_nom"] * 10), "2.1")
    if base.get("icc_max_pct") is not None:
        add(phase1, 164, "REG_Icc_max", "int16", round((base["icc_max_pct"] / 100.0) * 1000), "2.1")
    if base.get("vca_nom") is not None:
        vca_nom = base["vca_nom"]
        add(phase1, 165, "REG_Vca_nom", "int16", round(vca_nom * 10), "2.3")
        # Ajusta faixa Vca_min (0.80..0.90 pu) e Vca_max (1.10..1.20 pu) conforme Secao 4.2 (AL01/AL02)
        # para evitar que a UGE rejeite/sature AL01 (ex: 187V = 0.85pu) ou AL02 (ex: 253V = 1.15pu)
        al01_min = pit.get("limites_alarmes", {}).get("AL01", {}).get("min")
        al02_max = pit.get("limites_alarmes", {}).get("AL02", {}).get("max")
        vca_min_pu = (al01_min / vca_nom) if (al01_min and vca_nom > 0) else 0.80
        vca_max_pu = (al02_max / vca_nom) if (al02_max and vca_nom > 0) else 1.20
        vca_min_pu = min(0.90, max(0.80, vca_min_pu))
        vca_max_pu = min(1.20, max(1.10, vca_max_pu))
        add(phase1, 166, "REG_Vca_min", "int16", round(vca_min_pu * 1000), "2.3/4.2")
        add(phase1, 167, "REG_Vca_max", "int16", round(vca_max_pu * 1000), "2.3/4.2")
        add(phase1, 168, "REG_Freq_nom", "int16", 600, "2.3")
    if base.get("ur_vcc_eme") is not None:
        add(phase1, 169, "REG_UR_Vcc_eme", "int16", round(base["ur_vcc_eme"] * 10), "2.1")
    if base.get("ur_quantidade") is not None:
        add(phase1, 170, "REG_UR_Quantidade", "int16", base["ur_quantidade"], "2.2")
    if base.get("ur_sistema") in UR_SISTEMA_MAP:
        add(phase1, 171, "REG_UR_Sistema", "int16", UR_SISTEMA_MAP[base["ur_sistema"]], "2.3")

    rf = base.get("reles_fixos", {})
    add(
        phase1, 178, "REG_Reles_Fixos", "int32",
        _pack_reles_fixos(
            entrada=rf.get("desconexao_ca", 0),
            udq1=rf.get("udq_estagio_1", 0),
            udq2=rf.get("udq_estagio_2", 0),
            udq3=rf.get("udq_estagio_3", 0),
            lvd=rf.get("desconexao_cc", 0),
        ),
        "2.7",
    )

    # REG_UDQ_diodos (181): sempre gravar; quando PIT='---' (None), gravar EMPTY_I16 (-32768)
    udq_diodos = base.get("udq_diodos")
    add(phase1, 181, "REG_UDQ_diodos", "int16", udq_diodos if udq_diodos is not None else EMPTY_I16, "2.8")
    if base.get("udq_diodo_bloqueio") is not None:
        add(phase1, 182, "REG_UDQ_Opcoes", "int16", base["udq_diodo_bloqueio"], "2.8")

    # Sensores internos (tipo e 1-based no firmware: 1=ShuntIso60mV/TC5A, 2=ShuntDif60mV em Ibat; valor=0x8000 quando N/A)
    if base.get("sensor_iret_tipo"):
        # No TPS125, _MAP_Sens_Int_Update aceita somente tipo=1 (SAD_ShuntIso60mV) para REG_SInt_Iret (195)
        add(phase1, 195, "REG_SInt_Iret", "int32", _pack_sensor_int(1, 0x8000), "2.5")
    if base.get("sensor_iret_shunt_a") is not None:
        add(phase1, 211, "REG_SExt_Iret", "int32", _pack_sensor_ext(0, round(base["sensor_iret_shunt_a"] * 10), 0), "2.5")

    if base.get("sensor_ibat_tipo"):
        t_ibat = 2 if "DIF" in _norm(base["sensor_ibat_tipo"]) else 1
        add(phase1, 196, "REG_SInt_Ibat", "int32", _pack_sensor_int(t_ibat, 0x8000), "2.6")
    if base.get("sensor_ibat_shunt_a") is not None:
        add(phase1, 212, "REG_SExt_Ibat", "int32", _pack_sensor_ext(0, round(base["sensor_ibat_shunt_a"] * 10), 0), "2.6")

    if base.get("sensor_ica_tipo"):
        # _MAP_Sens_Int_Update aceita somente tipo=1 (SAA_TC5A) para REG_SInt_Ica (198)
        add(phase1, 198, "REG_SInt_Ica", "int32", _pack_sensor_int(1, 0x8000), "2.4")
    if base.get("sensor_ica_tc_a") is not None:
        esp = base.get("sensor_ica_espiras") or 1
        sext_ica_val = _pack_sensor_ext(0, round(base["sensor_ica_tc_a"] * 10), esp)
        # CRITICO (_MAP_Sens_Ext_Update datafunc.inc:972-988): ao alterar valor1 (TC), o firmware
        # invalida valor2 (espiras -> 0x80 EMPTY). A 2a escrita encontra valor1 igual e grava valor2!
        add(phase1, 214, "REG_SExt_Ica", "int32", sext_ica_val, "2.4 (TC)")
        add(phase1, 214, "REG_SExt_Ica", "int32", sext_ica_val, "2.4 (Espiras)")

    # ---------- FASE 2: SEC_Carga (P02 antes de P01!), Alarmes, DIN, Reles ----------
    param_order = ["P02", "P01"] + [f"P{k:02d}" for k in range(3, 20)]
    for code in param_order:
        p = pit["parametros"].get(code)
        if not p or p["valor"] is None:
            continue
        reg, rname, fmt, scale, bpu, tmult = PARAM_CAN_MAP[code]
        val = p["valor"]
        if fmt == "int32":
            # Temporizacoes: unidade do PIT -> segundos (UGE multiplica x1000 internamente)
            raw_int = round(val * tmult)
        else:
            # A UGE ja aplica a divisao por BPU_Vcc / BPU_Icc internamente ao receber o valor SI escalado
            raw_int = round(val / scale)
        add(phase2, reg, rname, fmt, raw_int, f"6.1:{code}")

    # Alarmes AL01..AL27
    for code, al in sorted(pit["alarmes"].items()):
        if code not in ALARM_CAN_MAP:
            continue
        reg_atu, atu_rw, scale_atu, reg_opt, opt_rw, reg_rele, rele_rw, suffix = ALARM_CAN_MAP[code]
        if atu_rw and al["valor"] is not None:
            val = al["valor"]
            raw_atu = round(val / scale_atu)
            add(phase2, reg_atu, f"REG_Atu_{suffix}", "int16", raw_atu, f"6.2:{code}")
        if opt_rw:
            if code == "AL27":
                # AL27 (Cbat_baixa) usa base de 1 minuto (60000 ms) no campo retardo de 16 bits
                ret_min = round((al.get("retardo_s") or 0.0) / 60.0)
                opt_val = ((ret_min & 0xFFFF) << 0) | ((_pack_acao(al.get("acao", "ALM")) & 0xF) << 16)
            else:
                opt_val = _pack_alarme_options(al.get("retardo_s"), al.get("acao", "ALM"))
            add(phase2, reg_opt, f"REG_Opt_{suffix}", "int32", opt_val, f"6.2:{code}")
        if rele_rw:
            r = al["reles"]
            add(phase2, reg_rele, f"REG_Rele_{suffix}", "int32", _pack_reles(**r), f"6.2:{code}")

    # Entradas Digitais CN1..CN8
    for code, din in sorted(pit["entradas_digitais"].items()):
        if code not in DIN_CAN_MAP:
            continue
        reg_opt, reg_rele = DIN_CAN_MAP[code]
        idx = code.replace("CN", "")
        opt_val = _pack_alarme_options(
            din.get("retardo_s"),
            din.get("acao", "NENHUM"),
            sinotico=din.get("sinotico", "NENHUM"),
            comando=din.get("comando", "NENHUM"),
            tipo_din=din.get("tipo", "DESL"),
        )
        add(phase2, reg_opt, f"REG_Opt_D{idx}", "int32", opt_val, f"6.3:{code}")
        add(phase2, reg_rele, f"REG_Rele_D{idx}", "int32", _pack_reles(**din["reles"]), f"6.3:{code}")

    # Saidas Rele de Status 01..22
    for code, st in sorted(pit["saidas_rele"].items()):
        if code not in STATUS_RELE_CAN_MAP:
            continue
        reg_rele, rname = STATUS_RELE_CAN_MAP[code]
        add(phase2, reg_rele, rname, "int32", _pack_reles(**st["reles"]), f"6.4:{code}")

    return {
        "phase1_base": phase1,
        "reboot_cmd": {"reg": 426, "name": "REG_Cmd_Reboot", "type": "int16", "value": 1, "source": "2.REBOOT"},
        "phase2_user": phase2,
    }


def parse_pit_file(path: str) -> Dict[str, Any]:
    fmt, rows = extract_rows(path)
    pit = parse_pit_rows(rows)
    warnings = validate_pit(pit)
    can_plan = build_can_writes(pit)
    return {
        "source_file": os.path.basename(path),
        "source_format": fmt,
        "pit": pit,
        "warnings": warnings,
        "can_plan": can_plan,
        "summary": {
            "phase1_writes": len(can_plan["phase1_base"]),
            "phase2_writes": len(can_plan["phase2_user"]),
            "params_parsed": len(pit["parametros"]),
            "alarms_parsed": len(pit["alarmes"]),
            "din_parsed": len(pit["entradas_digitais"]),
            "status_relays_parsed": len(pit["saidas_rele"]),
            "warnings_count": len(warnings),
            "errors_count": sum(1 for w in warnings if w["severity"] == "error"),
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python pit_parser.py <arquivo.csv|xlsx|docx|pdf> [--json]")
        sys.exit(1)
    result = parse_pit_file(sys.argv[1])
    if "--json" in sys.argv:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        s = result["summary"]
        m = result["pit"]["meta"]
        b = result["pit"]["base"]
        print(f"Arquivo : {result['source_file']} ({result['source_format'].upper()})")
        print(f"Cliente : {m.get('cliente')} | Modelo: {m.get('modelo')} | NS: {m.get('numero_serie')}")
        print(f"Base    : {b.get('vcc_nom')}V / {b.get('icc_nom')}A | URs={b.get('ur_quantidade')} | CA={b.get('vca_nom')}V ({b.get('ur_sistema')})")
        print(f"Parsed  : P={s['params_parsed']}/19 | AL={s['alarms_parsed']}/27 | CN={s['din_parsed']}/8 | ST={s['status_relays_parsed']}/22")
        print(f"CAN Plan: Fase1={s['phase1_writes']} writes -> Reboot(426) -> Fase2={s['phase2_writes']} writes")
        print(f"Alertas : {s['warnings_count']} ({s['errors_count']} erros)")
        for w in result["warnings"]:
            print(f"  [{w['severity'].upper()}] {w['code']}: {w['message']}")
