from setuptools import setup, find_packages

setup(
    name="codex-desktop",
    version="1.0.0",
    description="Unofficial Desktop Client for Codex on Linux using Codex app-server",
    author="Codex Desktop Contributors",
    author_email="community@example.com",
    license="MIT",
    url="https://github.com/example/codex-desktop-linux",
    packages=find_packages(),
    scripts=["bin/codex-desktop"],
    install_requires=[
        "PyGObject>=3.36.0",
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: X11 Applications :: GTK",
        "Intended Audience :: End Users/Desktop",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 3",
        "Topic :: Communications :: Chat",
    ],
    python_requires=">=3.10",
)
