"""
Slovník synonym pro normalizaci produktů z oblasti ořechy / sušené ovoce /
lyofilizované ovoce / čokolády.

Struktura:
  INGREDIENTS  – hlavní surovina → canonical klíč
  PROCESSING   – způsob zpracování → canonical klíč
  FLAVORS      – chuť / koření / přísada → canonical klíč
  COATINGS     – povlak (čokoláda atd.) → canonical klíč
  PACKAGING    – typ obalu → canonical klíč
  EXTRAS       – certifikace a bonusové atributy → canonical klíč

Každý záznam je slovník:  varianta_textu → canonical_hodnota

Varianty jsou lowercase BEZ diakritiky – normalizer nejprve text normalizuje,
teď porovnává tokeny oproti těmto klíčům.
"""

from typing import Dict

# ── Hlavní surovina ────────────────────────────────────────────────────────────
INGREDIENTS: Dict[str, str] = {
    # Kešu
    "kesu": "cashew", "kasu": "cashew", "kesu": "cashew",
    "cashew": "cashew", "kaju": "cashew",
    "kesu orechy": "cashew", "kesove orechy": "cashew",

    # Mandle
    "mandle": "almonds", "mandl": "almonds", "mandli": "almonds",
    "almond": "almonds", "almonds": "almonds",
    "mandlove": "almonds",

    # Pistácie
    "pistacie": "pistachios", "pistachio": "pistachios", "pistachios": "pistachios",
    "pistache": "pistachios", "pistacii": "pistachios",

    # Lískové ořechy
    "liskove orechy": "hazelnuts", "lieskovec": "hazelnuts", "lieskovce": "hazelnuts",
    "hazelnut": "hazelnuts", "hazelnuts": "hazelnuts",
    "liskac": "hazelnuts", "liskaci": "hazelnuts",

    # Arašídy
    "arasidy": "peanuts", "arasid": "peanuts",
    "peanut": "peanuts", "peanuts": "peanuts",
    "burske orechy": "peanuts", "burasaky": "peanuts",
    "arasidove": "peanuts",

    # Vlašské ořechy
    "vlasske orechy": "walnuts", "vlassky orech": "walnuts",
    "walnut": "walnuts", "walnuts": "walnuts",

    # Makadamia
    "makadamia": "macadamia", "macadamia": "macadamia",

    # Para ořechy
    "para orechy": "brazil_nuts", "para orech": "brazil_nuts",
    "brazil nut": "brazil_nuts", "brazil nuts": "brazil_nuts",
    "brazilsky orech": "brazil_nuts",

    # Pekan
    "pekan": "pecans", "pecan": "pecans", "pecans": "pecans",

    # Mango
    "mango": "mango", "manga": "mango",

    # Jahody
    "jahody": "strawberries", "jahoda": "strawberries",
    "strawberry": "strawberries", "strawberries": "strawberries",
    "jahodove": "strawberries",

    # Maliny
    "maliny": "raspberries", "malina": "raspberries",
    "raspberry": "raspberries", "raspberries": "raspberries",

    # Borůvky
    "boruvky": "blueberries", "boruvka": "blueberries",
    "blueberry": "blueberries", "blueberries": "blueberries",
    "cernicky": "blueberries",

    # Meruňky
    "merunky": "apricots", "merunka": "apricots",
    "marhuľky": "apricots", "marhule": "apricots",
    "apricot": "apricots", "apricots": "apricots",

    # Švestky / slívy
    "svestky": "plums", "svestka": "plums",
    "slivky": "plums", "slivka": "plums",
    "plum": "plums", "plums": "plums",
    "prune": "plums", "prunes": "plums",

    # Brusinky
    "brusinky": "cranberries", "brusinka": "cranberries",
    "brusnice": "cranberries",
    "cranberry": "cranberries", "cranberries": "cranberries",

    # Fíky
    "fiky": "figs", "fik": "figs",
    "figy": "figs", "figa": "figs",
    "fig": "figs", "figs": "figs",

    # Datle
    "datle": "dates", "datla": "dates",
    "datle medjool": "dates",
    "date": "dates", "dates": "dates",

    # Hrozinky
    "hrozinky": "raisins", "hrozinka": "raisins",
    "hrozienka": "raisins",
    "raisin": "raisins", "raisins": "raisins",

    # Ananas
    "ananas": "pineapple", "pineapple": "pineapple",

    # Papája
    "papaja": "papaya", "papaya": "papaya",

    # Kokos
    "kokos": "coconut", "coconut": "coconut",
    "kokosove": "coconut",

    # Semínka
    "slunecnice": "sunflower_seeds",
    "slunecnicova seminka": "sunflower_seeds",
    "sunflower seeds": "sunflower_seeds",
    "dyne seminka": "pumpkin_seeds",
    "tekvicove seminka": "pumpkin_seeds",
    "pumpkin seeds": "pumpkin_seeds",
    "chia": "chia",
    "len": "flax", "lnena semena": "flax", "flax": "flax",

    # Směsi – NIKDY se nepoužívají jako canonical_ingredient pro přesný match
    "mix orechu": "mixed_nuts", "oresna smes": "mixed_nuts",
    "mixed nuts": "mixed_nuts",
    "trail mix": "trail_mix",
}

# ── Způsob zpracování ──────────────────────────────────────────────────────────
PROCESSING: Dict[str, str] = {
    # Natural / RAW / surové
    "natural": "natural", "naturel": "natural",
    "raw": "raw", "surove": "raw",
    "neupravene": "natural",

    # Pražené
    "prazene": "roasted", "prazeny": "roasted",
    "roasted": "roasted", "pecene": "roasted",

    # Pražené na sucho
    "prazene na sucho": "dry_roasted",
    "dry roasted": "dry_roasted", "dry-roasted": "dry_roasted",
    "sucho prazene": "dry_roasted",

    # Solené
    "solene": "salted", "soleny": "salted",
    "salted": "salted", "slane": "salted",

    # Nesolené
    "nesolene": "unsalted", "nesoleny": "unsalted",
    "unsalted": "unsalted", "bez soli": "unsalted",
    "bez sole": "unsalted",

    # Uzené
    "uzene": "smoked", "uzeny": "smoked",
    "smoked": "smoked",

    # Lyofilizované
    "lyofilizovane": "freeze_dried", "lyofilizovana": "freeze_dried",
    "freeze dried": "freeze_dried", "freeze-dried": "freeze_dried",
    "mrazem susene": "freeze_dried", "mrazom susene": "freeze_dried",

    # Sušené
    "susene": "dried", "suseny": "dried",
    "dried": "dried", "dehydrovane": "dried",

    # BIO
    "bio": "bio", "organic": "bio", "ekologicke": "bio",
    "ekologicky": "bio",
}

# ── Chuť / koření / přísada (ne čokoláda – ta je v COATINGS) ──────────────────
FLAVORS: Dict[str, str] = {
    # Chilli
    "chilli": "chilli", "chili": "chilli",
    "hot": "chilli", "pikantni": "chilli",
    "ostry": "chilli",

    # Med
    "med": "honey", "honey": "honey", "medovy": "honey",
    "s medem": "honey",

    # Karamel
    "karamel": "caramel", "karamelovy": "caramel",
    "caramel": "caramel", "caramelized": "caramel",
    "karamelizovany": "caramel",

    # Wasabi
    "wasabi": "wasabi",

    # Skořice
    "skorice": "cinnamon", "cinnamon": "cinnamon",
    "skoricovy": "cinnamon",

    # Curry
    "curry": "curry",

    # BBQ
    "bbq": "bbq", "barbecue": "bbq",

    # Sezam
    "sezam": "sesame", "sesame": "sesame",
    "sezamovy": "sesame",

    # Vanilka
    "vanilka": "vanilla", "vanilla": "vanilla",
    "vanilkovy": "vanilla",
}

# ── Povlak (čokoláda, jogurt, …) ──────────────────────────────────────────────
COATINGS: Dict[str, str] = {
    # Hořká čokoláda
    "horka cokolada": "dark_chocolate",
    "dark chocolate": "dark_chocolate",
    "v horke cokolade": "dark_chocolate",
    "v tmave cokolade": "dark_chocolate",
    "horka": "dark_chocolate",  # pouze pokud je context čokoláda

    # Mléčná čokoláda
    "mlecna cokolada": "milk_chocolate",
    "milk chocolate": "milk_chocolate",
    "v mlecne cokolade": "milk_chocolate",
    "v mliecnej cokolade": "milk_chocolate",
    "mlecna": "milk_chocolate",

    # Bílá čokoláda
    "bila cokolada": "white_chocolate",
    "white chocolate": "white_chocolate",
    "v bile cokolade": "white_chocolate",
    "v bielej cokolade": "white_chocolate",
    "bila": "white_chocolate",

    # Generická čokoláda (nezjištěný typ)
    "cokolada": "chocolate",
    "chocolate": "chocolate",
    "cokoladovy": "chocolate",
    "v cokolade": "chocolate",

    # Jogurt
    "jogurt": "yogurt", "yogurt": "yogurt",
    "v jogurtu": "yogurt",

    # Kokos (jako povlak)
    "kokosovy povlak": "coconut_coated",
    "s kokosem": "coconut_coated",
}

# ── Typ balení ─────────────────────────────────────────────────────────────────
PACKAGING: Dict[str, str] = {
    "sacek": "bag", "bag": "bag", "pouch": "bag",
    "doypack": "doypack", "doy-pack": "doypack",
    "doza": "can", "can": "can", "tin": "can",
    "box": "box", "krabice": "box", "krabicka": "box",
    "darkove baleni": "gift_pack", "gift": "gift_pack",
    "multipack": "multipack", "sada": "multipack", "set": "multipack",
    "ziplock": "resealable", "reclosable": "resealable",
    "uzavitatelny": "resealable",
}

# ── Certifikace a bonusové atributy ───────────────────────────────────────────
EXTRAS: Dict[str, str] = {
    "bio": "bio",
    "vegan": "vegan", "vegansky": "vegan",
    "bez cukru": "sugar_free", "sugar free": "sugar_free",
    "bez lepku": "gluten_free", "gluten free": "gluten_free",
    "premium": "premium",
    "jumbo": "jumbo",
    "exclusive": "exclusive",
    "w240": "grade_w240", "w320": "grade_w320",
    "w180": "grade_w180",
}

# ── Marketingové/propagační slova k odstranění ────────────────────────────────
# Tato slova nic neznamenají pro matching a odstraňují se z normalized name
MARKETING_NOISE = {
    "super", "mega", "top", "kvalitni", "chutny", "oblibeny",
    "doporucujeme", "novinka", "novinka", "akce", "sleva",
    "nejlepsi", "vyborny", "delikatesa", "special", "extra",
    "grande", "original", "originalni", "classic", "klasicky",
    "premium",  # ponechat jako EXTRA, ale odstranit z normalized name
    "the", "and", "or",
}

# ── Hard-conflict páry ─────────────────────────────────────────────────────────
# Pokud watched product má processing X a kandidát má processing Y,
# a (X, Y) je v tomto setu, jde o hard reject
PROCESSING_CONFLICTS = {
    ("roasted", "natural"),
    ("roasted", "raw"),
    ("natural", "roasted"),
    ("raw", "roasted"),
    ("salted", "unsalted"),
    ("unsalted", "salted"),
    ("freeze_dried", "dried"),
    ("dried", "freeze_dried"),
    ("smoked", "natural"),
    ("smoked", "raw"),
}

# Povlakové konflikty – různé typy čokolády jsou inkompatibilní
COATING_CONFLICTS = {
    ("dark_chocolate", "white_chocolate"),
    ("white_chocolate", "dark_chocolate"),
    ("dark_chocolate", "milk_chocolate"),
    ("milk_chocolate", "dark_chocolate"),
    ("white_chocolate", "milk_chocolate"),
    ("milk_chocolate", "white_chocolate"),
}
