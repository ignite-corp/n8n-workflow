#!/usr/bin/env python3
# n8n DB 패치: webhook 노드의 responseMode를 options → parameters 최상위로 이동
# n8n import:workflow가 responseMode를 options 안에 재배치하는 문제 대응
import sqlite3, json, sys, os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.n8n', '.n8n', 'database.sqlite')
if not os.path.exists(db_path):
    sys.exit(0)

db = sqlite3.connect(db_path)
rows = db.execute("SELECT id, name, nodes FROM workflow_entity").fetchall()
fix = 0
for wid, wname, nodes_str in rows:
    nodes = json.loads(nodes_str)
    mod = False
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.webhook":
            opts = n.get("parameters", {}).get("options", {})
            if "responseMode" in opts and "responseMode" not in n["parameters"]:
                n["parameters"]["responseMode"] = opts.pop("responseMode")
                mod = True
                print(f"  Fix: {wname} > {n['name']} ({n['parameters']['responseMode']})")
    if mod:
        db.execute("UPDATE workflow_entity SET nodes=? WHERE id=?", (json.dumps(nodes, ensure_ascii=False), wid))
        fix += 1
db.commit()
db.close()
if fix:
    print(f"{fix}개 워크플로우 패치 완료")
