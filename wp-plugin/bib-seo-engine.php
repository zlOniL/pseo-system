<?php
/**
 * Plugin Name: BIB SEO Engine Adapter
 * Description: Recebe páginas HTML geradas pelo BIB SEO Engine e publica no WordPress.
 * Version: 1.6.0
 * Author: BIB
 */

if (!defined('ABSPATH')) {
    exit;
}

// Segredo partilhado com o backend NestJS.
// Adicionar em wp-config.php ANTES da linha "/* That's all, stop editing! */":
//   define('BIB_SECRET', 'o-seu-segredo-aqui');

add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/post', [
        'methods'             => 'POST',
        'callback'            => 'bib_create_or_update_post',
        'permission_callback' => 'bib_authenticate',
    ]);

    register_rest_route('custom/v1', '/media', [
        'methods'             => 'GET',
        'callback'            => 'bib_list_media',
        'permission_callback' => 'bib_authenticate',
    ]);

    register_rest_route('custom/v1', '/wp-cats', [
        'methods'             => 'GET',
        'callback'            => 'bib_list_categories',
        'permission_callback' => 'bib_authenticate',
    ]);

    register_rest_route('custom/v1', '/wp-cats', [
        'methods'             => 'POST',
        'callback'            => 'bib_create_category',
        'permission_callback' => 'bib_authenticate',
    ]);
});

function bib_authenticate(WP_REST_Request $request): bool {
    $secret = defined('BIB_SECRET') ? BIB_SECRET : '';
    if (empty($secret)) {
        return false;
    }

    // Tentar ler o header Authorization de várias fontes
    // (alguns servidores Apache fazem strip do header)
    $auth_header = $request->get_header('authorization');

    if (empty($auth_header) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth_header = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (empty($auth_header) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $auth_header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    if (empty($auth_header) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $auth_header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (!empty($auth_header) && strpos($auth_header, 'Bearer ') === 0) {
        $token = substr($auth_header, 7);
        return hash_equals($secret, $token);
    }

    return false;
}

function bib_create_or_update_post(WP_REST_Request $request): WP_REST_Response {
    $params  = $request->get_json_params();
    $title          = sanitize_text_field($params['title']          ?? '');
    $seo_title      = sanitize_text_field($params['seo_title']      ?? $title);
    $excerpt        = sanitize_text_field($params['excerpt']        ?? '');
    $meta_desc      = sanitize_text_field($params['meta_description'] ?? $excerpt);
    $raw     = $params['content'] ?? '';
    $status  = sanitize_text_field($params['status']  ?? 'publish');
    $slug    = sanitize_title($params['slug']          ?? $title);
    $categories = isset($params['categories']) && is_array($params['categories'])
        ? array_map('intval', $params['categories'])
        : [];
    $primary_category_id = isset($params['primary_category_id'])
        ? intval($params['primary_category_id'])
        : 0;

    // Sanitizar HTML mantendo atributos necessários para vídeo
    $allowed = wp_kses_allowed_html('post');
    $allowed['video'] = [
        'src'         => true,
        'autoplay'    => true,
        'loop'        => true,
        'muted'       => true,
        'controls'    => true,
        'width'       => true,
        'height'      => true,
        'style'       => true,
        'class'       => true,
        'playsinline' => true,
        'preload'     => true,
    ];
    $allowed['source'] = ['src' => true, 'type' => true];
    $allowed['article']['style'] = true;
    $allowed['section']['style'] = true;
    $allowed['div']  = ['style' => true, 'class' => true, 'id' => true];
    $allowed['span'] = ['style' => true, 'class' => true];

    $content = wp_kses($raw, $allowed);

    if (empty($title) || empty($content)) {
        return new WP_REST_Response(['error' => 'title e content são obrigatórios'], 400);
    }

    // Desligar wpautop para este post — o conteúdo já vem formatado
    add_filter('the_content', 'bib_disable_wpautop_for_post', 0);

    // Verificar se já existe um post/página com este slug
    $existing = get_page_by_path($slug, OBJECT, ['post', 'page']);

    if ($existing) {
        $post_id = wp_update_post([
            'ID'             => $existing->ID,
            'post_title'     => $title,
            'post_content'   => $content,
            'post_excerpt'   => $excerpt,
            'post_status'    => $status,
        ], true);
    } else {
        $post_id = wp_insert_post([
            'post_title'     => $title,
            'post_name'      => $slug,
            'post_content'   => $content,
            'post_excerpt'   => $excerpt,
            'post_status'    => $status,
            'post_type'      => 'post',
        ], true);
    }

    // Assign categories (if provided)
    if (!is_wp_error($post_id) && !empty($categories)) {
        wp_set_post_categories($post_id, $categories, false);
    }

    remove_filter('the_content', 'bib_disable_wpautop_for_post', 0);

    if (is_wp_error($post_id)) {
        return new WP_REST_Response(['error' => $post_id->get_error_message()], 500);
    }

    // Meta interna BIB
    update_post_meta($post_id, '_bib_raw_html', '1');

    // Meta description — Yoast SEO
    if (!empty($meta_desc)) {
        update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_desc);
        update_post_meta($post_id, '_yoast_wpseo_title', $seo_title . ' %%page%% %%sep%% %%sitename%%');
    }

    // Meta description — RankMath SEO (sempre, sem verificar function_exists)
    if (!empty($meta_desc)) {
        update_post_meta($post_id, 'rank_math_description', $meta_desc);
        update_post_meta($post_id, 'rank_math_title', $seo_title);
    }

    update_post_meta($post_id, 'rank_math_focus_keyword', $title);

    // Primary category — RankMath (meta key confirmado via pt24_postmeta)
    if ($primary_category_id > 0) {
        update_post_meta($post_id, 'rank_math_primary_category', $primary_category_id);
    }

    clean_post_cache($post_id);
    
    return new WP_REST_Response([
        'id'   => $post_id,
        'link' => get_permalink($post_id),
    ], 200);
}

// Desactivar wpautop em posts gerados pelo BIB (têm o meta _bib_raw_html)
add_filter('the_content', 'bib_maybe_disable_wpautop', 0);
function bib_maybe_disable_wpautop(string $content): string {
    if (is_singular() && get_post_meta(get_the_ID(), '_bib_raw_html', true)) {
        remove_filter('the_content', 'wpautop');
        remove_filter('the_content', 'wptexturize');
    }
    return $content;
}

function bib_disable_wpautop_for_post(string $content): string {
    return $content;
}

function bib_list_categories(WP_REST_Request $request): WP_REST_Response {
    $terms = get_terms([
        'taxonomy'   => 'category',
        'hide_empty' => false,
    ]);

    if (is_wp_error($terms)) {
        return new WP_REST_Response(['error' => $terms->get_error_message()], 500);
    }

    $result = array_map(function ($term) {
        return [
            'id'     => $term->term_id,
            'name'   => $term->name,
            'slug'   => $term->slug,
            'parent' => $term->parent,
        ];
    }, $terms);

    return new WP_REST_Response($result, 200);
}

function bib_create_category(WP_REST_Request $request): WP_REST_Response {
    $params      = $request->get_json_params();
    $name        = sanitize_text_field($params['name']   ?? '');
    $parent_name = sanitize_text_field($params['parent'] ?? 'Blog');

    if (empty($name)) {
        return new WP_REST_Response(['error' => 'name é obrigatório'], 400);
    }

    // Resolve parent category ID
    $parent_id = 0;
    if (!empty($parent_name)) {
        $parent_term = get_term_by('name', $parent_name, 'category');
        if ($parent_term) {
            $parent_id = $parent_term->term_id;
        }
    }

    // Check if category already exists
    $existing = get_term_by('name', $name, 'category');
    if ($existing) {
        // If it exists as top-level but should be under a parent, fix it
        if ($parent_id > 0 && (int) $existing->parent !== $parent_id) {
            wp_update_term($existing->term_id, 'category', ['parent' => $parent_id]);
            $existing = get_term($existing->term_id, 'category');
        }
        return new WP_REST_Response([
            'id'     => $existing->term_id,
            'name'   => $existing->name,
            'slug'   => $existing->slug,
            'parent' => $existing->parent,
        ], 200);
    }

    $result = wp_insert_term($name, 'category', ['parent' => $parent_id]);

    if (is_wp_error($result)) {
        return new WP_REST_Response(['error' => $result->get_error_message()], 500);
    }

    $term = get_term($result['term_id'], 'category');
    return new WP_REST_Response([
        'id'     => $term->term_id,
        'name'   => $term->name,
        'slug'   => $term->slug,
        'parent' => $term->parent,
    ], 201);
}

function bib_list_media(WP_REST_Request $request): WP_REST_Response {
    $type     = sanitize_text_field($request->get_param('type') ?? 'image');
    $page     = max(1, (int) ($request->get_param('page') ?? 1));
    $per_page = min(100, max(1, (int) ($request->get_param('per_page') ?? 50)));
    $search   = sanitize_text_field($request->get_param('search') ?? '');

    $mime_type = ($type === 'video') ? 'video' : 'image';

    $args = [
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => $per_page,
        'paged'          => $page,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'post_mime_type' => $mime_type,
    ];

    if (!empty($search)) {
        $args['s'] = $search;
    }

    $query = new WP_Query($args);
    $items = [];

    foreach ($query->posts as $post) {
        $url  = wp_get_attachment_url($post->ID);
        $item = [
            'id'        => $post->ID,
            'title'     => $post->post_title,
            'url'       => $url,
            'mime_type' => $post->post_mime_type,
            'date'      => $post->post_date,
            'thumbnail' => null,
        ];

        if (strpos($post->post_mime_type, 'image') !== false) {
            $thumb = wp_get_attachment_image_src($post->ID, 'medium');
            $item['thumbnail'] = $thumb ? $thumb[0] : $url;
        }

        $items[] = $item;
    }

    return new WP_REST_Response([
        'items'       => $items,
        'total'       => (int) $query->found_posts,
        'total_pages' => (int) $query->max_num_pages,
        'page'        => $page,
    ], 200);
}