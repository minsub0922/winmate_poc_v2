-- Winmate 제품 DB (v2) — v1 winmate-kb 제품 계층과 같은 이름 · 같은 뜻 + e-카탈로그 계층
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE category (            -- 사이트 목록(…/all-…/) = 분류
  id TEXT PRIMARY KEY, code TEXT UNIQUE, name_ko TEXT, site_disp_clsf_no TEXT, family_group TEXT, list_url TEXT, n_cards INTEGER, site_filters_json TEXT, origin TEXT);
CREATE TABLE product_family (      -- 사이트 상품 카드(사이즈 · 용량 · 색상 옵션을 묶은 단위)
  id TEXT PRIMARY KEY, goods_id TEXT UNIQUE, category_id TEXT REFERENCES category(id), subcategory_slug TEXT, comp_category_slug TEXT,
  name_ko TEXT, default_model_code TEXT, marketing_model TEXT, grp_path TEXT, detail_url TEXT, usp_json TEXT, sale_status_code TEXT, registered_at INTEGER,
  goods_type_code TEXT, flags TEXT, pdp_title TEXT, pdp_description TEXT, og_image TEXT, ctg1 TEXT, ctg2 TEXT, source_tier TEXT);
CREATE TABLE product_model (       -- 모델코드(옵션 하나 = SKU)
  model_code TEXT PRIMARY KEY, goods_id TEXT, family_id TEXT REFERENCES product_family(id), option_name TEXT, option_value TEXT, is_family_default INTEGER, sold_out_flag TEXT);
CREATE TABLE family_category (family_id TEXT, category_id TEXT, role TEXT, PRIMARY KEY(family_id, category_id));
CREATE TABLE product_tag (         -- 목록 필터 = 사이트 공식 그룹 · 라벨
  family_id TEXT, category_id TEXT, site_filter TEXT, site_group TEXT, site_label TEXT, PRIMARY KEY(family_id, category_id, site_filter));
CREATE TABLE spec_value (id INTEGER PRIMARY KEY, goods_id TEXT, model_code TEXT, family_id TEXT, seq INTEGER, group_name TEXT, attr_name TEXT, value_raw TEXT);
CREATE INDEX ix_spec_fam ON spec_value(family_id); CREATE INDEX ix_spec_model ON spec_value(model_code);
CREATE TABLE feature_block (id INTEGER PRIMARY KEY, family_id TEXT, seq INTEGER, component_type TEXT, headline TEXT, sub TEXT, body TEXT, disclaimer TEXT, n_images INTEGER);
CREATE INDEX ix_feat_fam ON feature_block(family_id);
CREATE TABLE feature_item (id INTEGER PRIMARY KEY, block_id INTEGER, seq INTEGER, headline TEXT, body TEXT);
CREATE TABLE image_asset (id INTEGER PRIMARY KEY, url TEXT, url_mobile TEXT, family_id TEXT, role TEXT, seq INTEGER, alt TEXT, block_id INTEGER, source TEXT);
CREATE INDEX ix_img_fam ON image_asset(family_id, role);
CREATE TABLE catalog_doc (dir TEXT PRIMARY KEY, title TEXT, doc_title TEXT, group_name TEXT, tab TEXT, pages INTEGER, viewer_url TEXT);
CREATE TABLE catalog_page (dir TEXT, page INTEGER, text TEXT, image_url TEXT, PRIMARY KEY(dir, page));
CREATE TABLE catalog_mention (dir TEXT, page INTEGER, surface TEXT, model_code TEXT, family_id TEXT, method TEXT, snippet TEXT);
CREATE INDEX ix_cm_fam ON catalog_mention(family_id); CREATE INDEX ix_cm_surface ON catalog_mention(surface);
CREATE TABLE catalog_product (     -- e-카탈로그에서 원문 그대로 옮긴 제품(사이트 카드에 대응하면 family_id)
  id TEXT PRIMARY KEY, name TEXT, series TEXT, models_json TEXT, category TEXT, family_group TEXT, specs_json TEXT, features_json TEXT, dir TEXT, pages_json TEXT, family_id TEXT, note TEXT, unmatched_models_json TEXT);
CREATE TABLE catalog_product_family (catalog_product_id TEXT, family_id TEXT, n_models INTEGER); -- 카탈로그 항목 ↔ 사이트 카드(모델코드가 맞은 수)
CREATE TABLE product_photo (       -- 카탈로그 전용 제품(ec_*) · 큐레이션(cur_*)의 실제 사진 = e-카탈로그 쪽(dir · page)에서 자른 영역(box_px), kind = cut · scene · diagram · none(사진 없음, note = 이유)
  owner TEXT, catalog_product_id TEXT, n INTEGER, dir TEXT, page INTEGER, box_json TEXT, kind TEXT, note TEXT, source TEXT, source_url TEXT, file TEXT);
-- 제품 이미지 라이브러리(imglib/index.json → imglib_db.py): 제품마다 정확히 연결된 관련 이미지
CREATE TABLE lib_image (           -- 이미지 한 장. kind = cut 제품 컷 · scene 설치 장면 · detail 기능 디테일 · ui 화면 · diagram 구성 그림, source = site_card · site_pdp · case · ecat · app
  id TEXT PRIMARY KEY, kind TEXT, source TEXT, title TEXT, descr TEXT, alt TEXT, context TEXT, url TEXT, catalog_page TEXT, box_json TEXT,
  file TEXT, width INTEGER, height INTEGER, spaces_json TEXT, industries_json TEXT, models_json TEXT, case_json TEXT, also_json TEXT, dhash TEXT);
CREATE TABLE lib_image_product (image_id TEXT, product_id TEXT, relation TEXT, PRIMARY KEY(image_id, product_id)); -- relation = own · catalog · case
CREATE INDEX ix_lip_prod ON lib_image_product(product_id);
CREATE VIRTUAL TABLE lib_image_fts USING fts5(id UNINDEXED, text, tokenize='unicode61');  -- 제품명 · 설명 · alt · 맥락 · 공간 · 모델코드 · 사례 고객
