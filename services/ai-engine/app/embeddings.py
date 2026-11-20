from typing import Any
import numpy as np
from sentence_transformers import SentenceTransformer
from app.config import get_settings

_model: SentenceTransformer | None = None

# Curated profile knowledge base for the 10 seeded Jharkhand Higher Education Institutions (HEIs)
SEEDED_HEI_PROFILES: dict[str, dict[str, Any]] = {
    "U-0205": {
        "name": "National Institute of Technology Jamshedpur",
        "domains": [
            "Water Filtration",
            "Mining Dust/Safety",
            "Metallurgical & Materials Engineering",
            "Environmental Remediation",
            "Smart Agriculture",
        ],
        "faculty_specializations": [
            "Heavy metal adsorption and defluoridation",
            "Acid mine drainage passive treatment",
            "Industrial water recycling and membrane filtration",
            "Sensor networks for mine safety",
        ],
        "lab_facilities": [
            "Advanced Water Quality & Environmental Engineering Lab",
            "Materials Characterization & Metallurgy Center",
            "Mine Safety & Dust Suppression Test Facility",
        ],
        "profile_summary": (
            "Premier Tier-1 National Institute of Technology with extensive research "
            "infrastructure in chemical defluoridation, groundwater filtration, acid mine "
            "drainage remediation, and industrial materials."
        ),
    },
    "U-0202": {
        "name": "Birla Institute of Technology Mesra",
        "domains": [
            "Solar Micro-Grids",
            "Renewable Energy & Storage",
            "IoT & Telemetry",
            "Cold Storage",
            "Rural Digital Literacy",
        ],
        "faculty_specializations": [
            "Decentralized DC micro-grids and battery management systems",
            "Solar photovoltaic lift irrigation systems",
            "IoT wireless sensor networks and tele-monitoring",
            "Off-grid thermal energy systems",
        ],
        "lab_facilities": [
            "Centre of Excellence in Renewable Energy",
            "Power Electronics & Smart Grid Laboratory",
            "IoT and Embedded Systems Research Hub",
        ],
        "profile_summary": (
            "Premier Tier-1 engineering institute with pioneering research in decentralized "
            "solar micro-grids, smart battery storage, telemetry-enabled irrigation, and "
            "off-grid rural power."
        ),
    },
    "U-0210": {
        "name": "Rajendra Institute of Medical Sciences Ranchi",
        "domains": [
            "Tribal Healthcare",
            "Public Health Diagnostics",
            "Biomedical Engineering",
            "Telemedicine",
            "Fluorosis & Malnutrition Epidemiology",
        ],
        "faculty_specializations": [
            "Sickle cell trait diagnostic screening",
            "Fluorosis epidemiology and clinical toxicology",
            "Maternal anemia and nutritional interventions",
            "Mobile diagnostic telemedicine clinics",
        ],
        "lab_facilities": [
            "Advanced Hematology & Genetic Screening Center",
            "Clinical Toxicology & Water Contaminant Pathology Unit",
            "State Telemedicine Research Network",
        ],
        "profile_summary": (
            "Apex Tier-1 medical research university specializing in tribal healthcare "
            "diagnostics, sickle cell disease eradication, fluorosis pathology, and "
            "community telemedicine."
        ),
    },
    "C-44102": {
        "name": "Birsa Institute of Technology Sindri",
        "domains": [
            "Mining Dust/Safety",
            "Solid Waste Management",
            "Fly Ash Utilization",
            "Chemical Processing",
        ],
        "faculty_specializations": [
            "Open-cast mine respirable dust suppression",
            "Fly ash geopolymer construction materials",
            "Industrial slag and solid waste remediation",
            "Underground mine gas detection telemetry",
        ],
        "lab_facilities": [
            "Mine Ventilation and Industrial Dust Testing Lab",
            "Geopolymer and Concrete Materials Testing Facility",
            "Chemical Environmental Analysis Center",
        ],
        "profile_summary": (
            "Tier-2 state engineering institution with specialized focus on mining dust "
            "suppression, pit safety sensors, industrial solid waste management, and fly ash "
            "utilization."
        ),
    },
    "U-0203": {
        "name": "Birsa Agricultural University",
        "domains": [
            "Smart Agriculture",
            "Cold Storage",
            "Soil Health & Remediation",
            "Drought Resistance",
            "Agro-Forestry & Lac Cultivation",
        ],
        "faculty_specializations": [
            "Solar-powered evaporative cold rooms for perishables",
            "Drought-resilient indigenous millets and pulses",
            "Precision soil moisture sensing and drip scheduling",
            "Lac processing and non-timber forest produce value addition",
        ],
        "lab_facilities": [
            "Post-Harvest Food Technology & Cold Storage Lab",
            "Precision Agriculture & Soil Health Center",
            "Agro-Forestry Processing Workshop",
        ],
        "profile_summary": (
            "Tier-2 premier agricultural university advancing decentralized cold storage, "
            "plateau lift irrigation, soil regeneration, and tribal agro-produce processing."
        ),
    },
    "U-0207": {
        "name": "Ranchi University",
        "domains": [
            "Solid Waste Management",
            "Rural Digital Literacy",
            "Environmental Chemistry",
            "Indigenous Languages",
        ],
        "faculty_specializations": [
            "Microbial organic waste rapid composting",
            "Biodegradable polymer degradation",
            "Tribal language digital pedagogy interfaces (Kurukh, Mundari, Santhali)",
            "Community environmental monitoring",
        ],
        "lab_facilities": [
            "Environmental Science & Bio-Resource Lab",
            "Digital Humanities & Linguistics Technology Center",
            "Polymer Chemistry Research Facility",
        ],
        "profile_summary": (
            "Tier-2 multidisciplinary university focusing on community solid waste composting, "
            "biodegradable materials, and localized tribal educational technologies."
        ),
    },
    "U-0204": {
        "name": "Kolhan University Chaibasa",
        "domains": [
            "Tribal Healthcare",
            "Water Filtration",
            "Ethnobotany & Herbal Formulations",
            "Rural Nutrition",
        ],
        "faculty_specializations": [
            "Indigenous medicinal plant pharmacology",
            "Maternal iron-deficiency anemia in tribal zones",
            "Low-cost sand and charcoal potable water filtration",
            "Ethnobotanical surveys in Saranda forest",
        ],
        "lab_facilities": [
            "Tribal Health and Ethnobotany Research Center",
            "Field Water Quality Monitoring Unit",
        ],
        "profile_summary": (
            "Tier-3 regional university serving West Singhbhum with grassroots focus on "
            "tribal public health, medicinal herbs, and village water quality."
        ),
    },
    "U-0208": {
        "name": "Sido Kanhu Murmu University Dumka",
        "domains": [
            "Rural Digital Literacy",
            "Solar Micro-Grids",
            "Santhal Parganas Civic Technology",
            "Offline Educational Devices",
        ],
        "faculty_specializations": [
            "Ol Chiki script digital learning modules",
            "Solar-assisted rural community learning kiosks",
            "Offline digital curriculum devices for unelectrified schools",
            "Decentralized village energy access",
        ],
        "lab_facilities": [
            "Santhal Vernacular Digital Innovation Lab",
            "Renewable Rural Technology Demonstration Center",
        ],
        "profile_summary": (
            "Tier-3 university in Santhal Parganas specializing in vernacular digital literacy "
            "platforms, offline education devices, and rural micro-solar applications."
        ),
    },
    "U-0206": {
        "name": "Nilamber Pitamber University Palamu",
        "domains": [
            "Water Filtration",
            "Drought Mitigation",
            "Fluorosis Surveillance",
            "Rainwater Harvesting",
        ],
        "faculty_specializations": [
            "Community fluoride adsorption using local biochar and alumina",
            "Fluorosis clinical surveillance in rural Palamu",
            "Hard-rock aquifer artificial groundwater recharge",
            "Drought impact mitigation",
        ],
        "lab_facilities": [
            "Palamu Water Quality & Fluoride Testing Center",
            "Rural Groundwater Hydrology Field Unit",
        ],
        "profile_summary": (
            "Tier-3 university located in drought-prone Palamu specializing in community "
            "water defluoridation, groundwater arsenic filtration, and drought mitigation."
        ),
    },
    "S-12055": {
        "name": "Government Polytechnic Adityapur",
        "domains": [
            "Mining Dust/Safety",
            "Mechanical Prototyping",
            "Smart Agriculture Hardware",
            "Water Filtration Fabrication",
        ],
        "faculty_specializations": [
            "Rapid workshop fabrication of filtration cartridges",
            "Solar water pump maintenance and assembly",
            "Low-cost mechanical enclosures for field sensors",
            "Precision tooling and lathe operations",
        ],
        "lab_facilities": [
            "Mechanical Fabrication & CNC Workshop",
            "Applied Electrical Machines Lab",
            "Materials Testing and Welding Facility",
        ],
        "profile_summary": (
            "Tier-3 technical polytechnic in Adityapur industrial hub specialized in "
            "rapid mechanical prototyping, tool design, and hardware maintenance."
        ),
    },
}


def get_embedding_model() -> SentenceTransformer:
    """
    Lazy singleton loader for the SentenceTransformer model.
    Loads sentence-transformers/all-MiniLM-L6-v2 (384 dimensions) on demand.
    """
    global _model
    if _model is None:
        settings = get_settings()
        _model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
    return _model


def embed_text(text: str) -> list[float]:
    """
    Computes an L2-normalized 384-dimensional embedding vector for input text.
    """
    content = text.strip() if text and text.strip() else "empty"
    model = get_embedding_model()
    # SentenceTransformer normalize_embeddings=True calculates L2 unit normalization
    vec: np.ndarray = model.encode(content, normalize_embeddings=True)
    return vec.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Computes L2-normalized 384-dimensional embedding vectors for a list of input texts.
    Efficient batch inference for multiple texts.
    """
    if not texts:
        return []
    cleaned = [t.strip() if (t and t.strip()) else "empty" for t in texts]
    model = get_embedding_model()
    vecs: np.ndarray = model.encode(cleaned, normalize_embeddings=True)
    return vecs.tolist()


def build_challenge_text(
    title: str,
    description: str,
    domain: str | None = None,
) -> str:
    """
    Constructs a canonical text representation of a civic or industrial challenge
    optimized for semantic embedding and deduplication matching.
    """
    parts: list[str] = []
    if domain and domain.strip():
        parts.append(f"Domain: {domain.strip()}")
    if title and title.strip():
        parts.append(f"Title: {title.strip()}")
    if description and description.strip():
        parts.append(f"Description: {description.strip()}")
    return " | ".join(parts) if parts else (title or description or "").strip()


def build_institution_text(
    name: str,
    domains: list[str] | str | None = None,
    faculty_specializations: list[str] | str | None = None,
    lab_facilities: list[str] | str | None = None,
    profile_summary: str | None = None,
) -> str:
    """
    Constructs a canonical text representation of an academic institution's R&D capabilities
    for vector similarity matching against civic/industrial challenges.
    """
    parts: list[str] = []
    if name and name.strip():
        parts.append(f"Institution: {name.strip()}")

    if domains:
        if isinstance(domains, list):
            domain_str = ", ".join(d.strip() for d in domains if d and d.strip())
        else:
            domain_str = str(domains).strip()
        if domain_str:
            parts.append(f"Domains: {domain_str}")

    if faculty_specializations:
        if isinstance(faculty_specializations, list):
            spec_str = ", ".join(s.strip() for s in faculty_specializations if s and s.strip())
        else:
            spec_str = str(faculty_specializations).strip()
        if spec_str:
            parts.append(f"Faculty Specializations: {spec_str}")

    if lab_facilities:
        if isinstance(lab_facilities, list):
            lab_str = ", ".join(l.strip() for l in lab_facilities if l and l.strip())
        else:
            lab_str = str(lab_facilities).strip()
        if lab_str:
            parts.append(f"Lab Facilities: {lab_str}")

    if profile_summary and profile_summary.strip():
        parts.append(f"Profile: {profile_summary.strip()}")

    return " | ".join(parts) if parts else (name or "").strip()


def get_institution_profile_metadata(code: str, name: str) -> dict[str, Any]:
    """
    Resolves known profile metadata for seeded HEIs, or provides a structured fallback
    for dynamic institutions.
    """
    if code in SEEDED_HEI_PROFILES:
        return SEEDED_HEI_PROFILES[code]

    # Check case-insensitive match on code or name
    for key, prof in SEEDED_HEI_PROFILES.items():
        if key.lower() == code.lower() or prof["name"].lower() == name.lower():
            return prof

    # Fallback for dynamic/unseeded institutions
    return {
        "name": name,
        "domains": ["General Engineering", "Applied Science", "Civic Technology"],
        "faculty_specializations": ["Applied Research", "Prototype Engineering", "Community Solutions"],
        "lab_facilities": ["Computer Labs", "Engineering Prototyping Workshop"],
        "profile_summary": f"Higher Education Institution: {name}",
    }
