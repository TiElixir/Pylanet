import yaml

def load_config(path="config.yaml"):
    with open(path, "r") as f:
        cfg = yaml.safe_load(f)

    if cfg is None:
        raise RuntimeError("config.yaml is empty or invalid")

    return cfg
