"""
Téléchargeur PBase : collections -> albums -> sous-albums -> photos EN TAILLE ORIGINALE.

Structure réelle du site (vérifiée sur pbase.com/nto_feeling) :
  - /nto_feeling/root&page=all     : liste de toutes les collections (div.gallery_entry-*)
  - /nto_feeling/<slug>            : une galerie. Les URLs sont "plates" : un sous-album
                                     a aussi une URL /nto_feeling/<autre_slug>, la hiérarchie
                                     n'est PAS dans l'URL mais dans la page du parent.
                                     Dans la grille de miniatures (td.thumbnail) :
                                       - lien .../image/<id>  -> une photo
                                       - lien .../<slug> + <b>:: Nom ::</b> -> un sous-album
  - /nto_feeling/image/<id>        : page d'une photo. Les liens small/medium/large/original
                                     portent l'URL réelle du fichier dans l'attribut `imgurl`.
                                     (Les pages .../original etc. renvoient 403 : il faut
                                     lire imgurl, puis télécharger ce fichier directement.)

Résultat sur disque :
  pbase_nto_feeling/<Collection>/<Album>/<Sous-album>/.../photo.jpg

Relancer le script reprend là où il s'était arrêté (fichiers déjà présents ignorés).
"""

import csv
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

# ============================================================
# CONFIGURATION
# ============================================================

PROFILE = "nto_feeling"
SITE = "https://pbase.com"
ROOT_URL = f"{SITE}/{PROFILE}/root&page=all"

OUTPUT_DIR = Path("pbase_nto_feeling")

REQUEST_DELAY = 0.4
REQUEST_TIMEOUT = 60
MAX_RETRIES = 4

# Ordre de préférence des tailles ; "original" = la photo en pleine résolution.
SIZE_PREFERENCE = ["original", "large", "medium", "small"]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"})

LOG_FILE = OUTPUT_DIR / "download_log.csv"

visited_galleries = set()
claimed_names = {}
stats = {"downloaded": 0, "skipped": 0, "failed": 0, "photos": 0}


# ============================================================
# OUTILS
# ============================================================

def clean_name(name, default="Sans_nom"):
    """Nom de dossier/fichier valable sous Windows ; retire les ':: TITRE ::' de PBase."""
    name = (name or "").replace("\xa0", " ")
    name = re.sub(r"^\s*::\s*", "", name)
    name = re.sub(r"\s*::\s*$", "", name)
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = "".join(c for c in name if ord(c) >= 32)
    name = re.sub(r"\s+", " ", name).strip().rstrip(". ")
    if not name:
        return default
    if name.upper() in {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}:
        name = "_" + name
    return name[:150]


def request(url, stream=False, referer=None):
    headers = {"Referer": referer} if referer else None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(url, timeout=REQUEST_TIMEOUT, stream=stream, headers=headers)
            if r.status_code == 200:
                time.sleep(REQUEST_DELAY)
                return r
            if r.status_code == 429 or r.status_code >= 500:
                wait = min(10 * attempt, 60)
                print(f"    [HTTP {r.status_code}] nouvel essai dans {wait}s")
                time.sleep(wait)
                continue
            print(f"    [HTTP {r.status_code}] {url}")
            return None
        except requests.RequestException as e:
            print(f"    [ERREUR RESEAU] {e}")
            time.sleep(min(3 * attempt, 20))
    return None


def get_soup(url):
    r = request(url)
    if r is None:
        return None
    # PBase sert parfois du Windows-1252 sans le déclarer : on évite les "�".
    try:
        text = r.content.decode("utf-8")
    except UnicodeDecodeError:
        text = r.content.decode("cp1252", errors="replace")
    return BeautifulSoup(text, "html.parser")


def log_result(status, page, url, local, size="", error=""):
    with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow([status, page, url, local, size, error])


def is_image_page(url):
    return bool(re.search(rf"/{PROFILE}/image/\d+/?$", urlparse(url).path))


def gallery_key(url):
    return urlparse(url).path.rstrip("/").lower()


# ============================================================
# ANALYSE DES PAGES
# ============================================================

def parse_collections(soup):
    """Page root&page=all : [(nom, url)] des collections."""
    result = []
    for entry in soup.select("div[class^=gallery_entry]"):
        title = entry.select_one(".title-gallery")
        link = entry.select_one("a.thumbnail[href]")
        if not link:
            continue
        name = clean_name(title.get_text(" ", strip=True) if title else link.get("alt", ""))
        result.append((name, urljoin(SITE, link["href"])))
    return result


def parse_gallery(url, soup):
    """Page d'une galerie : (liste de pages photo, liste de [(nom, url)] sous-albums)."""
    photos, subs = [], []
    for td in soup.select("td.thumbnail"):
        a = td.find("a", href=True)
        if not a:
            continue
        href = urljoin(url, a["href"])
        if is_image_page(href):
            if href not in photos:
                photos.append(href)
            continue
        bold = td.find("b")
        img = td.find("img")
        raw = bold.get_text(" ", strip=True) if bold else (img.get("alt", "") if img else "")
        name = clean_name(raw, default=clean_name(unquote(urlparse(href).path.rsplit("/", 1)[-1])))
        subs.append((name, href))
    return photos, subs


def extra_pages(url, soup):
    """Pages 2, 3... d'une galerie paginée (liens '...&page=N' vers la même galerie)."""
    base = gallery_key(url).split("&")[0]
    found = []
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        if re.search(r"[&?]page=\d+$", href) and gallery_key(href).split("&")[0] == base:
            if href not in found:
                found.append(href)
    return found


def best_photo(soup):
    """(url du fichier, nom de fichier d'origine) pour la plus grande taille disponible."""
    sizes = {}
    for a in soup.find_all("a", attrs={"imgurl": True}):
        sizes[a.get("imgsize")] = a["imgurl"]
    for size in SIZE_PREFERENCE:
        if size in sizes:
            return sizes[size], size
    return None, None


def filename_for(file_url, image_id):
    """Les originaux s'appellent <id>.<hash>.<nom d'origine>.jpg : on garde le nom d'origine."""
    base = os.path.basename(urlparse(file_url).path)
    m = re.match(r"^\d+\.[A-Za-z0-9_-]+\.(.+)$", base)
    if m:
        return clean_name(m.group(1))
    return clean_name(f"{image_id}{os.path.splitext(base)[1] or '.jpg'}")


# ============================================================
# TÉLÉCHARGEMENT
# ============================================================

def download_photo(page_url, folder):
    folder.mkdir(parents=True, exist_ok=True)
    image_id = re.search(r"/image/(\d+)", page_url).group(1)

    soup = get_soup(page_url)
    if soup is None:
        stats["failed"] += 1
        log_result("FAILED", page_url, "", "", error="page photo illisible")
        return
    file_url, size = best_photo(soup)
    if not file_url:
        stats["failed"] += 1
        log_result("FAILED", page_url, "", "", error="aucune URL d'image trouvée")
        print(f"    [ERREUR] pas d'URL d'image : {page_url}")
        return
    stats["photos"] += 1

    name = filename_for(file_url, image_id)
    path = folder / name
    # Deux photos différentes avec le même nom dans un album : on ajoute l'identifiant.
    if claimed_names.setdefault(path, image_id) != image_id:
        stem, ext = os.path.splitext(name)
        path = folder / f"{stem}_{image_id}{ext}"

    if path.exists() and path.stat().st_size > 0:
        stats["skipped"] += 1
        return

    if size != "original":
        print(f"    [AVERTISSEMENT] original indisponible, taille '{size}' utilisée : {name}")

    tmp = path.with_suffix(path.suffix + ".part")
    r = request(file_url, stream=True, referer=page_url)
    if r is None:
        stats["failed"] += 1
        log_result("FAILED", page_url, file_url, str(path), error="téléchargement impossible")
        return
    try:
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1024 * 128):
                if chunk:
                    f.write(chunk)
        if tmp.stat().st_size == 0:
            raise RuntimeError("fichier vide")
        os.replace(tmp, path)
        stats["downloaded"] += 1
        print(f"    [OK] {path.name}")
        log_result("DOWNLOADED", page_url, file_url, str(path), path.stat().st_size)
    except Exception as e:
        stats["failed"] += 1
        print(f"    [ERREUR] {e}")
        log_result("FAILED", page_url, file_url, str(path), error=str(e))
        tmp.unlink(missing_ok=True)
    finally:
        r.close()


# ============================================================
# PARCOURS RÉCURSIF
# ============================================================

def process_gallery(url, folder, depth=0):
    key = gallery_key(url)
    indent = "  " * depth
    if key in visited_galleries:
        print(f"{indent}[DÉJÀ VU] {folder.name} ({key})")
        return
    visited_galleries.add(key)

    soup = get_soup(url)
    if soup is None:
        stats["failed"] += 1
        return

    photos, subs = parse_gallery(url, soup)
    for page in extra_pages(url, soup):
        s = get_soup(page)
        if s is not None:
            p, sb = parse_gallery(page, s)
            photos += [x for x in p if x not in photos]
            subs += [x for x in sb if x not in subs]

    print(f"{indent}📁 {folder}  ({len(photos)} photos, {len(subs)} sous-albums)")
    folder.mkdir(parents=True, exist_ok=True)

    for photo in photos:
        download_photo(photo, folder)

    used = set()
    for name, sub_url in subs:
        sub_name = name
        if sub_name.lower() in used:  # deux sous-albums de même nom dans un parent
            sub_name = f"{name} ({gallery_key(sub_url).rsplit('/', 1)[-1]})"
        used.add(sub_name.lower())
        process_gallery(sub_url, folder / sub_name, depth + 1)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_FILE.exists():
        with open(LOG_FILE, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["status", "page", "file_url", "local_file", "size", "error"])

    print("=" * 70)
    print(f"PBASE DOWNLOADER - profil {PROFILE}")
    print("=" * 70)

    try:
        soup = get_soup(ROOT_URL)
        if soup is None:
            sys.exit("Impossible de lire la page des collections.")
        collections = parse_collections(soup)
        print(f"{len(collections)} collections trouvées\n")
        used = set()
        for name, url in collections:
            if name.lower() in used:
                name = f"{name} ({gallery_key(url).rsplit('/', 1)[-1]})"
            used.add(name.lower())
            process_gallery(url, OUTPUT_DIR / name)
    except KeyboardInterrupt:
        print("\nInterrompu. Relance le script pour reprendre.")

    print("\n" + "=" * 70)
    print(f"Photos trouvées : {stats['photos']} | téléchargées : {stats['downloaded']} | "
          f"déjà présentes : {stats['skipped']} | échecs : {stats['failed']}")
    print(f"Dossier : {OUTPUT_DIR.resolve()}\nJournal : {LOG_FILE.resolve()}")


if __name__ == "__main__":
    main()
