"""
Pytest configuration for INTEL·IOT backend tests

This file configures pytest fixtures and test discovery.
"""

import sys
import os

# Add src directory to path so tests can import from src
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import pytest


@pytest.fixture
def backend_root():
    """Get the backend root directory"""
    return os.path.dirname(__file__)


@pytest.fixture
def config_dir(backend_root):
    """Get the config directory"""
    return os.path.join(backend_root, 'config')


@pytest.fixture
def models_dir(backend_root):
    """Get the models directory"""
    return os.path.join(backend_root, 'models')


@pytest.fixture
def test_cases_dir(backend_root):
    """Get the test_cases directory"""
    return os.path.join(backend_root, 'test_cases')


# Test discovery configuration
collect_ignore = ['venv', '__pycache__', '.pytest_cache', 'models']
testpaths = ['test_cases']
python_files = ['test_*.py', '*_test.py']
python_classes = ['Test*']
python_functions = ['test_*']
