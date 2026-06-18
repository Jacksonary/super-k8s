use std::fmt::Display;

pub fn kube_error(action: &str, err: impl Display) -> String {
    let raw = err.to_string();
    let lower = raw.to_lowercase();

    if lower.contains("403") || lower.contains("forbidden") {
        "Permission denied".to_string()
    } else if lower.contains("401") || lower.contains("unauthorized") {
        "Authentication failed, check credentials".to_string()
    } else if lower.contains("404") || lower.contains("not found") {
        "Resource not found".to_string()
    } else if lower.contains("409") || lower.contains("conflict") {
        "Resource conflict, refresh and retry".to_string()
    } else if lower.contains("timeout") || lower.contains("timed out") || lower.contains("deadline")
    {
        "Request timed out".to_string()
    } else if lower.contains("connection refused")
        || lower.contains("connection reset")
        || lower.contains("connection closed")
        || lower.contains("no route to host")
        || lower.contains("could not resolve")
        || lower.contains("dns")
    {
        "Cannot connect to Kubernetes API server".to_string()
    } else if lower.contains("certificate") || lower.contains("tls") || lower.contains("x509") {
        "TLS certificate error".to_string()
    } else {
        let detail = compact_detail(&raw);
        let action = action.trim();
        if action.is_empty() {
            detail
        } else {
            format!("{action} failed: {detail}")
        }
    }
}

pub fn kubeconfig_error(err: impl Display) -> String {
    let raw = err.to_string();
    let lower = raw.to_lowercase();
    if lower.contains("no current context") || lower.contains("current-context") {
        "No current context in kubeconfig".to_string()
    } else if lower.contains("invalid") || lower.contains("parse") || lower.contains("yaml") {
        "Invalid kubeconfig YAML".to_string()
    } else {
        format!("Failed to load kubeconfig: {}", compact_detail(&raw))
    }
}

fn compact_detail(raw: &str) -> String {
    let one_line = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX_LEN: usize = 140;
    if one_line.chars().count() <= MAX_LEN {
        return one_line;
    }
    let mut out = one_line.chars().take(MAX_LEN).collect::<String>();
    out.push_str("...");
    out
}
