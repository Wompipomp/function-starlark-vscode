# Targets: function-starlark v1.7+
"""function-starlark builtins.

This file provides autocomplete, hover docs, and signature help
for the function-starlark Crossplane composition runtime.
"""

# ---------------------------------------------------------------------------
# Predeclared variables
# ---------------------------------------------------------------------------

oxr = {}  # type: dict
"""Observed composite resource (XR). Frozen/read-only dict.

Contains the current observed state of the composite resource as last
seen by Crossplane. Use get(oxr, "spec.parameters.name") for safe access.
"""

dxr = {}  # type: dict
"""Desired composite resource (XR). Mutable dict.

Write to this dict to set desired status or metadata on the XR.
Changes are applied back to the Crossplane response.
"""

observed = {}  # type: dict
"""Observed composed resources. Frozen dict of frozen dicts keyed by resource name.

Each value is the full observed Kubernetes resource manifest.
Use get_observed(name, path) for convenient access.
"""

context = {}  # type: dict
"""Pipeline context. Mutable dict for passing data between pipeline steps.

Persists across pipeline functions within the same reconciliation.
"""

environment = {}  # type: dict
"""Environment configuration from EnvironmentConfig. Frozen/read-only dict.

Extracted from the well-known context key
'apiextensions.crossplane.io/environment'.
"""

extra_resources = {}  # type: dict
"""Extra/required resources fetched via require_extra_resource/require_extra_resources.

Frozen dict mapping requirement name to a list of matching resource dicts,
or None if no matches found.
"""

# ---------------------------------------------------------------------------
# Resource management
# ---------------------------------------------------------------------------

def Resource(name, body, ready=None, labels=None, connection_details=None, depends_on=None, external_name=None):
    """Create a desired composed resource.

    Emits a Kubernetes resource as part of this composition. The resource
    will be managed by Crossplane and reconciled to the desired state.

    Crossplane traceability labels from the XR are auto-injected unless
    labels=None is passed to explicitly opt out.

    Args:
        name: Unique resource key within this composition (e.g., "my-bucket").
        body: Dict containing the full Kubernetes resource manifest
            (apiVersion, kind, metadata, spec).
        ready: Whether this resource contributes to XR readiness.
            True/False/None (default: None = defer to function-auto-ready).
        labels: Dict of labels to apply. Pass None to opt out of
            auto-injection of Crossplane traceability labels.
        connection_details: Dict of string key-value pairs for per-resource
            connection details to propagate.
        depends_on: List of dependencies. Items can be ResourceRef objects
            (from other Resource() calls), strings, or (ref, field_path) tuples.
        external_name: Crossplane external-name annotation value.

    Returns:
        ResourceRef that can be passed to depends_on in other Resource() calls.
    """
    pass


def skip_resource(name, reason):
    """Intentionally skip a resource and emit a Warning event.

    Use when a resource should be conditionally omitted. Deduplicates
    warnings (only the first skip for a given name emits an event).
    Errors if the resource was already created via Resource().

    Args:
        name: Resource name to skip.
        reason: Human-readable reason for skipping.

    Returns:
        None
    """
    pass

# ---------------------------------------------------------------------------
# Data access utilities
# ---------------------------------------------------------------------------

def get(obj, path, default=None):
    """Safely access a nested dict value using a dot-separated path.

    Traverses obj following each segment of path. Returns default if any
    segment is missing or None.

    Args:
        obj: The dict (or value) to traverse.
        path: Dot-separated path string (e.g., "spec.parameters.name")
            or a list of keys (e.g., ["metadata", "annotations",
            "app.kubernetes.io/name"]).
        default: Value to return if path not found (default: None).

    Returns:
        The value at the path, or default.
    """
    pass


def get_label(res, key, default=None):
    """Safely get a label value from a resource.

    Looks up metadata.labels[key] without dot-splitting on the key.
    Perfect for labels containing dots like "app.kubernetes.io/name".

    Args:
        res: Resource dict to query.
        key: Label key (exact match, no dot-splitting).
        default: Value to return if label not found (default: None).

    Returns:
        Label value or default.
    """
    pass


def get_annotation(res, key, default=None):
    """Safely get an annotation value from a resource.

    Looks up metadata.annotations[key] without dot-splitting on the key.
    Perfect for annotations containing dots like "crossplane.io/external-name".

    Args:
        res: Resource dict to query.
        key: Annotation key (exact match, no dot-splitting).
        default: Value to return if annotation not found (default: None).

    Returns:
        Annotation value or default.
    """
    pass


def get_observed(name, path, default=None):
    """Get a value from an observed composed resource.

    One-call convenience: finds the observed resource by name, then
    traverses the dot-path within it.

    Args:
        name: Observed resource name (must not be empty).
        path: Dot-separated path string or list of keys.
        default: Value to return if not found (default: None).

    Returns:
        Value at path in the observed resource, or default.
    """
    pass

# ---------------------------------------------------------------------------
# Status conditions & events
# ---------------------------------------------------------------------------

def set_condition(type, status, reason, message, target="Composite"):
    """Set a status condition on the composite resource (XR).

    Sets an informational status condition. Does NOT control XR readiness -
    readiness is managed by the ready= parameter on Resource() or by
    function-auto-ready.

    Args:
        type: Condition type (e.g., "Ready", "Synced", "Degraded").
        status: Condition status: "True", "False", or "Unknown".
        reason: Machine-readable reason (e.g., "Available").
        message: Human-readable message.
        target: Where to set the condition. "Composite" (default) or
            "CompositeAndClaim".

    Returns:
        None
    """
    pass


def set_xr_status(path, value):
    """Write a value into the XR's status at a dot-path.

    Auto-creates intermediate dicts as needed (mkdir -p semantics).
    Non-dict values at intermediate paths are silently overwritten.

    Args:
        path: Dot-separated path like "conditions" or "summary.ready".
            Must not be empty, no leading/trailing dots, no "..".
        value: Value to set.

    Returns:
        None
    """
    pass


def emit_event(severity, message, target="Composite"):
    """Emit a Kubernetes event on the composite resource.

    Args:
        severity: Event severity: "Normal" or "Warning".
        message: Human-readable event message.
        target: Where to emit the event. "Composite" (default) or
            "CompositeAndClaim".

    Returns:
        None
    """
    pass

# ---------------------------------------------------------------------------
# Connection details
# ---------------------------------------------------------------------------

def set_connection_details(details_dict):
    """Set XR-level connection details.

    Multiple calls merge additively - a second call adds keys rather
    than replacing all. Per-resource connection details are handled
    via Resource(connection_details=...).

    Args:
        details_dict: Dict of string key-value pairs (e.g., endpoint,
            password, connection string).

    Returns:
        None
    """
    pass

# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def fatal(message):
    """Halt composition execution with a fatal error.

    Conditions, events, and requirements collected before fatal() are
    still applied to the response for diagnostics.

    Args:
        message: Error message describing the fatal condition.

    Returns:
        Never returns (halts execution).
    """
    pass

# ---------------------------------------------------------------------------
# Resource requirements
# ---------------------------------------------------------------------------

def require_extra_resource(name, apiVersion, kind, match_name=None, match_labels=None):
    """Request a single extra resource from the cluster.

    At least one of match_name or match_labels is required. If both are
    provided, match_name takes precedence and a warning is emitted.

    Results are available in the extra_resources dict in subsequent
    pipeline steps.

    Args:
        name: Requirement name (used as key in extra_resources).
        apiVersion: Resource API version (e.g., "v1", "apps/v1").
        kind: Resource kind (e.g., "ConfigMap", "Secret").
        match_name: Match by exact resource name.
        match_labels: Dict of label key-value pairs to match.

    Returns:
        None
    """
    pass


def require_extra_resources(name, apiVersion, kind, match_labels):
    """Request multiple matching extra resources from the cluster.

    Unlike require_extra_resource, this always matches by labels and
    can return multiple resources.

    Results are available in the extra_resources dict in subsequent
    pipeline steps.

    Args:
        name: Requirement name (used as key in extra_resources).
        apiVersion: Resource API version (e.g., "v1", "apps/v1").
        kind: Resource kind (e.g., "ConfigMap", "Secret").
        match_labels: Dict of label key-value pairs to match (required).

    Returns:
        None
    """
    pass

# ---------------------------------------------------------------------------
# Schema definitions
# ---------------------------------------------------------------------------

def schema(name, doc=None, **fields):
    """Define a typed schema constructor.

    Creates a callable that validates keyword arguments against field
    descriptors at construction time and returns a validated dict.
    The schema callable accepts only keyword arguments matching the
    defined fields.

    Args:
        name: Schema name (e.g., "DeploymentSpec"). Used in error messages.
        doc: Optional documentation string for the schema.
        **fields: Field definitions as keyword arguments. Each value must be
            a field() descriptor (e.g., replicas=field(type="int")).

    Returns:
        A callable schema constructor.
    """
    pass


def field(type=None, required=False, default=None, enum=None, doc=None, items=None):
    """Define a field descriptor for use in schema().

    Describes the type, constraints, and documentation for a single
    field in a schema definition.

    Args:
        type: Expected value type. Either a primitive type string
            ("string", "int", "float", "bool", "list", "dict") or a
            schema reference for nested validation. None means any type.
        required: Whether this field must be provided. Mutually exclusive
            with default.
        default: Default value when field is omitted. Mutually exclusive
            with required.
        enum: List of allowed values. Value must be one of these.
        doc: Documentation string for this field.
        items: Schema for list element validation. Only valid when
            type="list". Each list element is validated against this schema.

    Returns:
        A field descriptor.
    """
    pass
