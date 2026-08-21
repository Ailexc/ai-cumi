"""
Static catalog data for AiCumi backend:
- skill catalog (available skills for the skill market)
- persona templates (refine wizard quick-start)
- staff roles (add-staff wizard)

These are product-curated lists. Persisted member state lives in the DB.
"""

# ---- Skill catalog (frontend: /api/skills/catalog) ----
SKILL_CATALOG = [
    {"id": "web_search", "name": "网络搜索", "description": "搜索互联网获取最新信息并汇总结果。", "category": "信息获取", "source": "local"},
    {"id": "web_crawl", "name": "网页抓取", "description": "抓取指定网页正文内容，用于调研与资料收集。", "category": "信息获取", "source": "clawhub"},
    {"id": "translate", "name": "多语翻译", "description": "中英等多语互译，保留原文语气与术语。", "category": "信息获取", "source": "local"},
    {"id": "document_generate", "name": "文档创作", "description": "生成 Markdown 报告、方案、周报等结构化文档。", "category": "创作", "source": "local"},
    {"id": "image_gen", "name": "图片生成", "description": "根据描述生成配图，适用于内容运营场景。", "category": "创作", "source": "clawhub"},
    {"id": "code_exec", "name": "代码执行", "description": "编写并执行 Python/Shell 代码，处理数据与自动化任务。", "category": "协作", "source": "local"},
    {"id": "calendar", "name": "日程管理", "description": "查询与安排日程、会议，协同团队成员时间。", "category": "协作", "source": "local"},
    {"id": "file_ops", "name": "文件读写", "description": "在工作目录中读写文件，组织项目资料。", "category": "管理", "source": "local"},
    {"id": "memory_index", "name": "记忆索引", "description": "把对话历史整理为长期记忆，支持检索复用。", "category": "管理", "source": "local"},
]

SKILL_DOCS = {
    "web_search": "## web_search\n\n搜索互联网获取最新信息。\n\n用法：`web_search(query)`\n\n返回：来源列表 + 摘要。",
    "web_crawl": "## web_crawl\n\n抓取网页正文。\n\n用法：`web_crawl(url)`\n\n注意：只抓取正文，忽略导航/广告。",
    "translate": "## translate\n\n多语互译。\n\n用法：`translate(text, target_lang)`\n\n保留原文格式与术语。",
    "document_generate": "## document_generate\n\n生成结构化文档。\n\n用法：`document_generate(title, outline, content)`\n\n输出 Markdown。",
    "image_gen": "## image_gen\n\n根据描述生成图片。\n\n用法：`image_gen(prompt, size)`\n\n返回图片 URL。",
    "code_exec": "## code_exec\n\n执行 Python/Shell 代码。\n\n用法：`code_exec(code)`\n\n返回 stdout/stderr。",
    "calendar": "## calendar\n\n日程管理。\n\n用法：`calendar(action, params)`\n\n支持查询/创建日程。",
    "file_ops": "## file_ops\n\n工作目录文件操作。\n\n用法：`file_ops(action, path, content?)`\n\n支持读写/列目录。",
    "memory_index": "## memory_index\n\n整理长期记忆。\n\n用法：`memory_index(rebuild=False)`\n\n从对话历史生成记忆摘要。",
}

SKILL_ID_TO_INDEX = {s["id"]: s for s in SKILL_CATALOG}


def get_skill(id: str):
    return SKILL_ID_TO_INDEX.get(id)


# ---- Persona templates (frontend: /api/persona-templates) ----
PERSONA_TEMPLATES = [
    {
        "id": "warm",
        "name": "温暖贴心",
        "desc": "像知心伙伴一样沟通，关注感受与细节",
        "tone": "温暖贴心",
        "style": "响应式",
        "boundary": "不替用户做决定，涉及他人隐私不主动追问",
        "duty": "",
    },
    {
        "id": "efficient",
        "name": "干练高效",
        "desc": "目标导向，快速产出，主动汇报",
        "tone": "干练高效",
        "style": "主动出击",
        "boundary": "不闲聊，不重复已确认的结论",
        "duty": "",
    },
    {
        "id": "humor",
        "name": "幽默风趣",
        "desc": "轻松有趣的交流氛围，段子手担当",
        "tone": "幽默风趣",
        "style": "混合",
        "boundary": "不拿用户或团队成员开玩笑",
        "duty": "",
    },
    {
        "id": "calm",
        "name": "沉稳可靠",
        "desc": "严谨专业，数据说话，值得信赖",
        "tone": "沉稳可靠",
        "style": "混合",
        "boundary": "不编造数据，不确定的标注不确定性",
        "duty": "",
    },
    {
        "id": "direct",
        "name": "犀利直率",
        "desc": "直击要点，不绕弯子，敢说真话",
        "tone": "犀利直率",
        "style": "主动出击",
        "boundary": "不人身攻击，重要提醒用委婉方式",
        "duty": "",
    },
]

# ---- Staff roles (frontend: /api/roles) ----
STAFF_ROLES = [
    {"id": "assistant", "label": "助理", "title": "全能助理"},
    {"id": "executor", "label": "执行", "title": "执行专员"},
    {"id": "partner", "label": "伙伴", "title": "交流伙伴"},
    {"id": "advisor", "label": "顾问", "title": "调研顾问"},
    {"id": "direct", "label": "直率", "title": "直率干将"},
]

# persona skeleton per role (used by staff preview)
ROLE_PERSONA_SKELETON = {
    "assistant": "你是{name}，一位贴心的全能助理。你善于理解用户需求，提供周到的服务，把复杂的事拆成清晰的步骤。",
    "executor": "你是{name}，一位高效的执行专员。你专注于完成任务，注重细节与交付质量，凡事有交代、件件有着落。",
    "partner": "你是{name}，一位幽默的交流伙伴。你善于营造轻松氛围，让对话充满乐趣，同时认真倾听。",
    "advisor": "你是{name}，一位沉稳的调研顾问。你善于收集和分析信息，用数据和事实说话，输出深入的研究结论。",
    "direct": "你是{name}，一位犀利直率的干将。你直接表达观点，不绕弯子，追求效率与结果。",
}

ROLE_TEMPLATE = {
    "assistant": "assistant",
    "executor": "executor",
    "partner": "partner",
    "advisor": "advisor",
    "direct": "direct",
}
